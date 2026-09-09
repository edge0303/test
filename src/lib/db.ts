import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_login_at TEXT
);

-- 로그인 코드는 평문으로 저장하지 않는다. DB가 유출돼도 코드를 재사용할 수 없어야 한다.
CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codes_email ON login_codes(email, consumed);

-- 세션 토큰도 해시로만 저장한다. 쿠키 값 자체는 DB 어디에도 남지 않는다.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  biz_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT,
  tax_type TEXT,
  industry_code TEXT,
  industry_name TEXT,
  region_sido TEXT,
  region_sigungu TEXT,
  founded_at TEXT,
  employee_band TEXT,
  revenue_band TEXT,
  is_woman_owned INTEGER,
  is_disabled_owned INTEGER,
  is_social_enterprise INTEGER,
  is_venture_certified INTEGER,
  has_research_institute INTEGER,
  profile_completeness INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_uid TEXT NOT NULL,
  title TEXT NOT NULL,
  agency TEXT NOT NULL,
  category TEXT,
  fund_type TEXT NOT NULL DEFAULT 'grant',
  support_amount_min INTEGER,
  support_amount_max INTEGER,
  apply_start_at TEXT,
  apply_end_at TEXT,
  briefing_at TEXT,
  target_summary TEXT,
  url TEXT,
  parse_status TEXT NOT NULL DEFAULT 'parsed',
  raw_json TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (source, source_uid)
);
CREATE INDEX IF NOT EXISTS idx_programs_end ON programs(apply_end_at);

CREATE TABLE IF NOT EXISTS program_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field TEXT NOT NULL,
  operator TEXT NOT NULL,
  value TEXT,
  is_disqualifier INTEGER NOT NULL DEFAULT 1,
  is_bonus INTEGER NOT NULL DEFAULT 0,
  source_text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rules_program ON program_rules(program_id);

CREATE TABLE IF NOT EXISTS interests (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (company_id, program_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  engine TEXT NOT NULL DEFAULT 'deterministic',
  final_score INTEGER,
  iteration_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS application_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sections_app ON application_sections(application_id, section_key, version);

CREATE TABLE IF NOT EXISTS review_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  total INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fact_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT,
  source TEXT,
  UNIQUE (application_id, slot_key)
);

CREATE TABLE IF NOT EXISTS expert_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  assignee TEXT,
  memo TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  due_at TEXT,
  delivered_at TEXT,
  change_log_json TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  program_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  dday INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  sent_at TEXT,
  UNIQUE (company_id, program_id, channel, dday)
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __govfund_db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (global.__govfund_db) return global.__govfund_db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  global.__govfund_db = db;
  return db;
}

/**
 * 기존 DB에 대한 보정.
 * 인증 도입 이전에 만들어진 companies 행에는 user_id 가 없다.
 * 이 행들은 소유자가 없으므로 어떤 사용자도 조회할 수 없다 — 의도된 동작이다.
 */
function migrate(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(companies)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'user_id')) {
    db.exec('ALTER TABLE companies ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  }
  // 만료된 세션·로그인 코드는 접속할 때마다 정리한다.
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM login_codes WHERE expires_at < ?').run(now - 86_400_000);
}

export function resetDb(): void {
  if (global.__govfund_db) {
    global.__govfund_db.close();
    global.__govfund_db = undefined;
  }
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
}
