import { getDb } from './db';
import type {
  Company, Program, ProgramRule, MatchResult, JudgeResult, SectionKey, DraftSection, FactSlot,
} from './types';
import { matchOne, sortMatches } from './matcher';

/**
 * 소유권 규칙
 * ─────────────────────────────────────────────────────────────
 * 모든 조회·수정은 "그 자원이 이 사용자의 것인가"를 먼저 확인한다.
 * 소유자가 아니면 403이 아니라 null 을 돌려준다 — 자원의 존재 여부까지 숨기기 위함이다.
 * user_id 가 NULL 인 행(인증 도입 이전 데이터)은 누구의 것도 아니므로 항상 접근 불가다.
 */

/** 소유권 검증 없는 원본 조회. 내부에서만 쓰고 라우트에서 직접 부르지 않는다. */
function getCompanyRaw(id: number): Company | null {
  return (getDb().prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company) ?? null;
}

export function getCompanyOwned(id: number, userId: number): Company | null {
  const c = getCompanyRaw(id);
  if (!c || c.user_id !== userId) return null;
  return c;
}

/** 이 사용자의 기업. 여러 개면 가장 최근에 수정한 것. */
export function getCompanyForUser(userId: number): Company | null {
  return (getDb()
    .prepare('SELECT * FROM companies WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(userId) as Company) ?? null;
}

export function listCompaniesForUser(userId: number): Company[] {
  return getDb()
    .prepare('SELECT * FROM companies WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as Company[];
}

export function getCompanyByBizNo(bizNo: string): Company | null {
  return (getDb().prepare('SELECT * FROM companies WHERE biz_no = ?').get(bizNo) as Company) ?? null;
}

export class OwnershipError extends Error {}

/**
 * biz_no 는 전역 UNIQUE 다. 소유자 확인 없이 upsert 하면
 * 남의 사업자번호를 입력해 그 회사 프로파일을 덮어쓸 수 있다. 그래서 여기서 막는다.
 */
export function upsertCompany(
  c: Partial<Company> & { biz_no: string; name: string },
  userId: number,
): number {
  const db = getDb();
  const existing = getCompanyByBizNo(c.biz_no);
  if (existing && existing.user_id !== userId) {
    throw new OwnershipError('이미 다른 계정에 등록된 사업자등록번호입니다.');
  }
  const cols = [
    'name', 'status', 'tax_type', 'industry_code', 'industry_name', 'region_sido', 'region_sigungu',
    'founded_at', 'employee_band', 'revenue_band', 'is_woman_owned', 'is_disabled_owned',
    'is_social_enterprise', 'is_venture_certified', 'has_research_institute', 'profile_completeness',
  ] as const;

  if (existing) {
    const sets = cols.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(
      `UPDATE companies SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`,
    ).run({ ...defaults(c), id: existing.id });
    return existing.id;
  }
  const info = db.prepare(
    `INSERT INTO companies (biz_no, user_id, ${cols.join(', ')})
     VALUES (@biz_no, @user_id, ${cols.map((k) => '@' + k).join(', ')})`,
  ).run({ ...defaults(c), biz_no: c.biz_no, user_id: userId });
  return Number(info.lastInsertRowid);
}

function defaults(c: Partial<Company>) {
  return {
    name: c.name ?? '',
    status: c.status ?? null,
    tax_type: c.tax_type ?? null,
    industry_code: c.industry_code ?? null,
    industry_name: c.industry_name ?? null,
    region_sido: c.region_sido ?? null,
    region_sigungu: c.region_sigungu ?? null,
    founded_at: c.founded_at ?? null,
    employee_band: c.employee_band ?? null,
    revenue_band: c.revenue_band ?? null,
    is_woman_owned: c.is_woman_owned ?? null,
    is_disabled_owned: c.is_disabled_owned ?? null,
    is_social_enterprise: c.is_social_enterprise ?? null,
    is_venture_certified: c.is_venture_certified ?? null,
    has_research_institute: c.has_research_institute ?? null,
    profile_completeness: c.profile_completeness ?? 0,
  };
}

export function listPrograms(): Program[] {
  return getDb().prepare('SELECT * FROM programs').all() as Program[];
}

export function getProgram(id: number): Program | null {
  return (getDb().prepare('SELECT * FROM programs WHERE id = ?').get(id) as Program) ?? null;
}

export function rulesFor(programId: number): ProgramRule[] {
  return getDb()
    .prepare('SELECT * FROM program_rules WHERE program_id = ? ORDER BY is_bonus, id')
    .all(programId) as ProgramRule[];
}

export function allRules(): Map<number, ProgramRule[]> {
  const rows = getDb().prepare('SELECT * FROM program_rules ORDER BY is_bonus, id').all() as ProgramRule[];
  const map = new Map<number, ProgramRule[]>();
  for (const r of rows) {
    if (!map.has(r.program_id)) map.set(r.program_id, []);
    map.get(r.program_id)!.push(r);
  }
  return map;
}

/** 회사 1곳에 대해 전체 공고를 매칭한다. 공고 수가 적어 전수 계산해도 충분히 빠르다. */
export function matchAll(company: Company, today = new Date()): MatchResult[] {
  const programs = listPrograms();
  const rules = allRules();
  return sortMatches(programs.map((p) => matchOne(company, p, rules.get(p.id) ?? [], today)));
}

export function dataSourceInfo(): { sources: { source: string; count: number }[]; hasLive: boolean } {
  const rows = getDb()
    .prepare('SELECT source, COUNT(*) AS count FROM programs GROUP BY source')
    .all() as { source: string; count: number }[];
  return { sources: rows, hasLive: rows.some((r) => r.source !== 'seed') };
}

/* ---------------- 관심 공고 ---------------- */

export function toggleInterest(companyId: number, programId: number): boolean {
  const db = getDb();
  const exists = db
    .prepare('SELECT 1 FROM interests WHERE company_id = ? AND program_id = ?')
    .get(companyId, programId);
  if (exists) {
    db.prepare('DELETE FROM interests WHERE company_id = ? AND program_id = ?').run(companyId, programId);
    return false;
  }
  db.prepare('INSERT INTO interests (company_id, program_id) VALUES (?, ?)').run(companyId, programId);
  return true;
}

export function interestIds(companyId: number): Set<number> {
  const rows = getDb()
    .prepare('SELECT program_id FROM interests WHERE company_id = ?')
    .all(companyId) as { program_id: number }[];
  return new Set(rows.map((r) => r.program_id));
}

/* ---------------- 지원서 ---------------- */

export interface ApplicationRow {
  id: number;
  company_id: number;
  program_id: number;
  status: string;
  engine: string;
  final_score: number | null;
  iteration_count: number;
  created_at: string;
  updated_at: string;
}

export function findApplication(companyId: number, programId: number): ApplicationRow | null {
  return (getDb()
    .prepare('SELECT * FROM applications WHERE company_id = ? AND program_id = ?')
    .get(companyId, programId) as ApplicationRow) ?? null;
}

function getApplicationRaw(id: number): ApplicationRow | null {
  return (getDb().prepare('SELECT * FROM applications WHERE id = ?').get(id) as ApplicationRow) ?? null;
}

/** 지원서 → 기업 → 소유자 순으로 따라가 확인한다. 남의 지원서는 없는 것으로 취급한다. */
export function getApplicationOwned(id: number, userId: number): ApplicationRow | null {
  const app = getApplicationRaw(id);
  if (!app) return null;
  const company = getCompanyOwned(app.company_id, userId);
  return company ? app : null;
}

/** 관리자 화면 전용 — 소유권을 넘어 조회한다. 반드시 관리자 가드 뒤에서만 호출할 것. */
export function getApplicationAsAdmin(id: number): ApplicationRow | null {
  return getApplicationRaw(id);
}

export function createApplication(companyId: number, programId: number, engine: string): number {
  const info = getDb()
    .prepare('INSERT INTO applications (company_id, program_id, engine) VALUES (?, ?, ?)')
    .run(companyId, programId, engine);
  return Number(info.lastInsertRowid);
}

export function saveSections(applicationId: number, sections: DraftSection[], version: number): void {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO application_sections (application_id, section_key, version, content) VALUES (?, ?, ?, ?)',
  );
  const tx = db.transaction(() => {
    for (const s of sections) stmt.run(applicationId, s.key, version, s.content);
  });
  tx();
}

export function latestSections(applicationId: number): { key: SectionKey; content: string; version: number }[] {
  const rows = getDb().prepare(
    `SELECT section_key AS key, content, version FROM application_sections s
     WHERE application_id = ?
       AND version = (SELECT MAX(version) FROM application_sections
                      WHERE application_id = s.application_id AND section_key = s.section_key)
     ORDER BY CASE section_key
       WHEN 'problem' THEN 1 WHEN 'solution' THEN 2 WHEN 'scaleup' THEN 3 ELSE 4 END`,
  ).all(applicationId) as { key: SectionKey; content: string; version: number }[];
  return rows;
}

export function saveScore(applicationId: number, iteration: number, result: JudgeResult): void {
  getDb()
    .prepare('INSERT INTO review_scores (application_id, iteration, total, payload_json) VALUES (?, ?, ?, ?)')
    .run(applicationId, iteration, result.total, JSON.stringify(result));
  getDb()
    .prepare(
      `UPDATE applications SET final_score = ?, iteration_count = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
    )
    .run(result.total, iteration, applicationId);
}

export function scoreHistory(applicationId: number): { iteration: number; total: number; payload: JudgeResult }[] {
  const rows = getDb()
    .prepare('SELECT iteration, total, payload_json FROM review_scores WHERE application_id = ? ORDER BY iteration')
    .all(applicationId) as { iteration: number; total: number; payload_json: string }[];
  return rows.map((r) => ({ iteration: r.iteration, total: r.total, payload: JSON.parse(r.payload_json) }));
}

export function saveFactSlots(applicationId: number, slots: FactSlot[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO fact_slots (application_id, slot_key, label, value, source)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (application_id, slot_key) DO UPDATE SET value = excluded.value, source = excluded.source`,
  );
  const tx = db.transaction(() => {
    for (const s of slots) stmt.run(applicationId, s.key, s.label, s.value, s.source);
  });
  tx();
}

export function getFactSlots(applicationId: number): FactSlot[] {
  return getDb()
    .prepare('SELECT slot_key AS key, label, value, source FROM fact_slots WHERE application_id = ?')
    .all(applicationId) as FactSlot[];
}

export function setApplicationStatus(id: number, status: string): void {
  getDb()
    .prepare("UPDATE applications SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(status, id);
}

/* ---------------- 전문가 검수 ---------------- */

export interface ExpertReviewRow {
  id: number;
  application_id: number;
  status: string;
  assignee: string | null;
  memo: string | null;
  requested_at: string;
  due_at: string | null;
  delivered_at: string | null;
}

export function requestExpertReview(applicationId: number, memo: string, dueAt: string): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM expert_reviews WHERE application_id = ? AND status != 'done'")
    .get(applicationId) as ExpertReviewRow | undefined;
  if (existing) return existing.id;
  const info = db
    .prepare('INSERT INTO expert_reviews (application_id, memo, due_at) VALUES (?, ?, ?)')
    .run(applicationId, memo, dueAt);
  setApplicationStatus(applicationId, 'review_requested');
  return Number(info.lastInsertRowid);
}

export function getExpertReview(applicationId: number): ExpertReviewRow | null {
  return (getDb()
    .prepare('SELECT * FROM expert_reviews WHERE application_id = ? ORDER BY id DESC LIMIT 1')
    .get(applicationId) as ExpertReviewRow) ?? null;
}

export function listExpertQueue(): (ExpertReviewRow & { title: string; company: string; score: number | null })[] {
  return getDb().prepare(
    `SELECT er.*, p.title, c.name AS company, a.final_score AS score
     FROM expert_reviews er
     JOIN applications a ON a.id = er.application_id
     JOIN programs p ON p.id = a.program_id
     JOIN companies c ON c.id = a.company_id
     ORDER BY CASE er.status WHEN 'queued' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, er.requested_at`,
  ).all() as (ExpertReviewRow & { title: string; company: string; score: number | null })[];
}

export function updateExpertReview(id: number, patch: { status?: string; assignee?: string; memo?: string }): void {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM expert_reviews WHERE id = ?').get(id) as ExpertReviewRow;
  if (!cur) return;
  db.prepare(
    `UPDATE expert_reviews SET status = ?, assignee = ?, memo = ?,
       delivered_at = CASE WHEN ? = 'done' THEN datetime('now','localtime') ELSE delivered_at END
     WHERE id = ?`,
  ).run(patch.status ?? cur.status, patch.assignee ?? cur.assignee, patch.memo ?? cur.memo, patch.status ?? cur.status, id);
  if (patch.status === 'done') setApplicationStatus(cur.application_id, 'reviewed');
}
