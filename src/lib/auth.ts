import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { deliverLoginCode } from './mail';

/* ────────────────────────────────────────────────────────────
   세션 인증 (이메일 + 일회용 인증번호)
   - 인증번호와 세션 토큰은 해시로만 저장한다.
   - 인가 판정은 미들웨어가 아니라 각 라우트에서 직접 한다.
     (미들웨어 계층 우회 취약점의 영향을 받지 않도록)
   ──────────────────────────────────────────────────────────── */

export const SESSION_COOKIE = 'gfr_session';
export const CSRF_COOKIE = 'gfr_csrf';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14일
const CODE_TTL_MS = 10 * 60 * 1000;              // 10분
const MAX_CODE_ATTEMPTS = 5;
const CODE_COOLDOWN_MS = 60 * 1000;              // 재발송 간격
const MAX_CODES_PER_HOUR = 5;

export interface SessionUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
}
export interface Session {
  user: SessionUser;
  csrf: string;
}

function sha256(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex');
}
function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function normalizeEmail(raw: string): string {
  return (raw || '').trim().toLowerCase();
}
export function isValidEmail(email: string): boolean {
  // 길이 검사를 정규식보다 먼저 한다. 순서가 반대면 긴 입력이 정규식에 그대로 들어간다.
  if (email.length > 254) return false;
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,60}$/.test(email);
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => normalizeEmail(e))
      .filter(Boolean),
  );
}

/* ── 인증번호 발급 ───────────────────────────────────────── */

export type RequestCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_email' | 'cooldown' | 'rate_limited' };

export async function requestLoginCode(rawEmail: string): Promise<RequestCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };

  const db = getDb();
  const now = Date.now();

  const last = db
    .prepare('SELECT created_at FROM login_codes WHERE email = ? ORDER BY id DESC LIMIT 1')
    .get(email) as { created_at: number } | undefined;
  if (last && now - last.created_at < CODE_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };

  const recent = db
    .prepare('SELECT COUNT(*) AS c FROM login_codes WHERE email = ? AND created_at > ?')
    .get(email, now - 3_600_000) as { c: number };
  if (recent.c >= MAX_CODES_PER_HOUR) return { ok: false, reason: 'rate_limited' };

  // 이전 코드는 즉시 무효화한다 (동시에 여러 코드가 살아 있지 않도록)
  db.prepare('UPDATE login_codes SET consumed = 1 WHERE email = ? AND consumed = 0').run(email);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(
    'INSERT INTO login_codes (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(email, sha256(`${email}:${code}`), now + CODE_TTL_MS, now);

  await deliverLoginCode({ to: email, code, expiresInMinutes: CODE_TTL_MS / 60000 });
  return { ok: true };
}

/* ── 인증번호 검증 + 세션 생성 ──────────────────────────── */

export type VerifyResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'invalid_email' | 'no_code' | 'expired' | 'too_many' | 'mismatch' };

export async function verifyLoginCode(rawEmail: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };

  const db = getDb();
  const now = Date.now();
  const row = db
    .prepare('SELECT * FROM login_codes WHERE email = ? AND consumed = 0 ORDER BY id DESC LIMIT 1')
    .get(email) as { id: number; code_hash: string; expires_at: number; attempts: number } | undefined;

  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expires_at < now) {
    db.prepare('UPDATE login_codes SET consumed = 1 WHERE id = ?').run(row.id);
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    db.prepare('UPDATE login_codes SET consumed = 1 WHERE id = ?').run(row.id);
    return { ok: false, reason: 'too_many' };
  }

  db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
  if (!safeEqual(row.code_hash, sha256(`${email}:${String(code || '').trim()}`))) {
    return { ok: false, reason: 'mismatch' };
  }
  db.prepare('UPDATE login_codes SET consumed = 1 WHERE id = ?').run(row.id);

  const role: SessionUser['role'] = adminEmails().has(email) ? 'admin' : 'user';
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as SessionUser | undefined;
  if (!user) {
    const info = db.prepare('INSERT INTO users (email, role) VALUES (?, ?)').run(email, role);
    user = { id: Number(info.lastInsertRowid), email, role };
  } else {
    // 관리자 지정은 환경변수가 진실의 원천이다. 로그인할 때마다 맞춘다.
    db.prepare("UPDATE users SET role = ?, last_login_at = datetime('now','localtime') WHERE id = ?")
      .run(role, user.id);
    user = { ...user, role };
  }

  await createSession(user);
  return { ok: true, user };
}

async function createSession(user: SessionUser): Promise<void> {
  const token = randomToken();
  const csrf = randomToken(24);
  const now = Date.now();
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), user.id, csrf, now, now + SESSION_TTL_MS);

  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS / 1000,
  });
  // CSRF 토큰은 클라이언트 JS가 읽어 헤더에 실어야 하므로 httpOnly 가 아니다.
  // 이 값만으로는 세션이 되지 않는다.
  jar.set(CSRF_COOKIE, csrf, {
    httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

/* ── 세션 조회 ──────────────────────────────────────────── */

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = getDb().prepare(
    `SELECT s.csrf_token, s.expires_at, u.id, u.email, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  ).get(sha256(token)) as
    | { csrf_token: string; expires_at: number; id: number; email: string; role: 'user' | 'admin' }
    | undefined;

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return { user: { id: row.id, email: row.email, role: row.role }, csrf: row.csrf_token };
}

/** 페이지용 — 로그인 안 되어 있으면 /login 으로 보낸다. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

/**
 * 관리자 전용 페이지용.
 * 권한이 없으면 403이 아니라 notFound() 를 던진다 — 화면의 존재 자체를 숨기기 위함이다.
 */
export async function requireAdminSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login?next=/admin/reviews');
  if (s.user.role !== 'admin') {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return s;
}

/* ── CSRF ───────────────────────────────────────────────── */

/**
 * 상태를 바꾸는 요청에 대한 이중 방어.
 *  1) Origin(없으면 Referer) 호스트가 요청 호스트와 같아야 한다.
 *  2) 세션에 저장된 CSRF 토큰과 요청이 제시한 토큰이 같아야 한다.
 * 둘 중 하나라도 어긋나면 거부한다.
 */
export async function assertSameOrigin(): Promise<boolean> {
  const h = await headers();
  const host = h.get('host');
  if (!host) return false;
  const source = h.get('origin') || h.get('referer');
  if (!source) return false; // 상태 변경 요청은 출처를 밝혀야 한다
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export async function assertCsrf(session: Session, providedToken?: string | null): Promise<boolean> {
  if (!(await assertSameOrigin())) return false;
  const jar = await cookies();
  const token = providedToken ?? (await headers()).get('x-csrf-token') ?? jar.get(CSRF_COOKIE)?.value;
  if (!token) return false;
  return safeEqual(session.csrf, token);
}

/* ── 라우트 핸들러용 가드 ───────────────────────────────── */

export interface GuardFail { response: Response }

export function isFail(v: unknown): v is GuardFail {
  return typeof v === 'object' && v !== null && 'response' in v;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** API용: 세션 + CSRF를 한 번에 검사한다. 실패하면 그대로 반환할 Response 를 준다. */
export async function guardApi(opts: { csrfToken?: string | null; admin?: boolean } = {}):
  Promise<Session | GuardFail> {
  const session = await getSession();
  if (!session) return { response: json({ ok: false, message: '로그인이 필요합니다.' }, 401) };
  if (opts.admin && session.user.role !== 'admin') {
    return { response: json({ ok: false, message: '찾을 수 없습니다.' }, 404) };
  }
  if (!(await assertCsrf(session, opts.csrfToken))) {
    return { response: json({ ok: false, message: '요청 출처를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.' }, 403) };
  }
  return session;
}
