import { getDb } from './db';
import type { FundType, ParseStatus } from './types';
import seed from '../../data/seed-programs.json';

/* ------------------------------------------------------------------ *
 * 공고 적재 공통 유틸
 * ------------------------------------------------------------------ */

export interface IncomingProgram {
  source: string;
  source_uid: string;
  title: string;
  agency: string;
  category: string | null;
  fund_type: FundType;
  support_amount_min: number | null;
  support_amount_max: number | null;
  apply_start_at: string | null;
  apply_end_at: string | null;
  briefing_at: string | null;
  target_summary: string | null;
  url: string | null;
  parse_status: ParseStatus;
  raw?: unknown;
  rules: {
    label: string;
    field: string;
    operator: string;
    value: unknown;
    is_disqualifier: number;
    is_bonus: number;
    source_text: string;
  }[];
}

/** source + source_uid 로 멱등 적재. 재실행해도 중복이 생기지 않는다. */
export function upsertPrograms(items: IncomingProgram[]): { inserted: number; updated: number } {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  const findStmt = db.prepare('SELECT id FROM programs WHERE source = ? AND source_uid = ?');
  const insertStmt = db.prepare(
    `INSERT INTO programs
      (source, source_uid, title, agency, category, fund_type, support_amount_min, support_amount_max,
       apply_start_at, apply_end_at, briefing_at, target_summary, url, parse_status, raw_json)
     VALUES (@source, @source_uid, @title, @agency, @category, @fund_type, @support_amount_min,
             @support_amount_max, @apply_start_at, @apply_end_at, @briefing_at, @target_summary,
             @url, @parse_status, @raw_json)`,
  );
  const updateStmt = db.prepare(
    `UPDATE programs SET title=@title, agency=@agency, category=@category, fund_type=@fund_type,
       support_amount_min=@support_amount_min, support_amount_max=@support_amount_max,
       apply_start_at=@apply_start_at, apply_end_at=@apply_end_at, briefing_at=@briefing_at,
       target_summary=@target_summary, url=@url, parse_status=@parse_status, raw_json=@raw_json,
       fetched_at=datetime('now','localtime')
     WHERE id=@id`,
  );
  const delRules = db.prepare('DELETE FROM program_rules WHERE program_id = ?');
  const insRule = db.prepare(
    `INSERT INTO program_rules (program_id, label, field, operator, value, is_disqualifier, is_bonus, source_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction((list: IncomingProgram[]) => {
    for (const it of list) {
      const row = { ...it, raw_json: it.raw ? JSON.stringify(it.raw) : null } as Record<string, unknown>;
      delete row.rules;
      delete row.raw;

      const found = findStmt.get(it.source, it.source_uid) as { id: number } | undefined;
      let id: number;
      if (found) {
        updateStmt.run({ ...row, id: found.id });
        id = found.id;
        updated++;
      } else {
        id = Number(insertStmt.run(row).lastInsertRowid);
        inserted++;
      }
      delRules.run(id);
      for (const r of it.rules) {
        insRule.run(
          id, r.label, r.field, r.operator,
          r.value === null || r.value === undefined ? null : JSON.stringify(r.value),
          r.is_disqualifier, r.is_bonus, r.source_text,
        );
      }
    }
  });
  tx(items);
  return { inserted, updated };
}

/* ------------------------------------------------------------------ *
 * 1) 시드 데이터 적재
 * ------------------------------------------------------------------ */

function offsetDate(days: number | null | undefined, base = new Date()): string | null {
  if (days === null || days === undefined) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function loadSeed(base = new Date()): { inserted: number; updated: number } {
  const items: IncomingProgram[] = (seed.programs as any[]).map((p) => ({
    source: 'seed',
    source_uid: p.source_uid,
    title: p.title,
    agency: p.agency,
    category: p.category ?? null,
    fund_type: p.fund_type,
    support_amount_min: p.support_amount_min ?? null,
    support_amount_max: p.support_amount_max ?? null,
    apply_start_at: offsetDate(p.start_offset_days, base),
    apply_end_at: offsetDate(p.end_offset_days, base),
    briefing_at: offsetDate(p.briefing_offset_days, base),
    target_summary: p.target_summary ?? null,
    url: p.url ?? 'https://www.bizinfo.go.kr',
    parse_status: p.parse_status ?? 'parsed',
    rules: p.rules ?? [],
  }));
  return upsertPrograms(items);
}

/* ------------------------------------------------------------------ *
 * 2) 기업마당(bizinfo) 실데이터 수집
 *
 * 주의: 공공 API의 필드명은 변경될 수 있다. 매핑은 이 파일 한 곳에만 두어
 * 스펙이 바뀌어도 여기만 고치면 되도록 격리했다.
 * 응답 형태가 예상과 다르면 조용히 실패하지 않고 원본을 그대로 보고한다.
 * ------------------------------------------------------------------ */

const FUND_TYPE_HINTS: [RegExp, FundType][] = [
  [/융자|대출|자금지원|정책자금/, 'loan'],
  [/보증/, 'guarantee'],
  [/바우처/, 'voucher'],
];

function guessFundType(text: string): FundType {
  for (const [re, t] of FUND_TYPE_HINTS) if (re.test(text)) return t;
  return 'grant';
}

/** 'YYYYMMDD ~ YYYYMMDD' / 'YYYY-MM-DD ~ YYYY-MM-DD' 등을 파싱 */
export function parsePeriod(raw: string | undefined | null): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  const dates = [...raw.matchAll(/(\d{4})[-.\/]?(\d{2})[-.\/]?(\d{2})/g)].map(
    (m) => `${m[1]}-${m[2]}-${m[3]}`,
  );
  if (dates.length === 0) return { start: null, end: null };
  if (dates.length === 1) return { start: null, end: dates[0] };
  return { start: dates[0], end: dates[dates.length - 1] };
}

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function mapBizinfoItem(item: Record<string, unknown>): IncomingProgram | null {
  const uid = pick(item, ['pblancId', 'pblance_id', 'id']);
  const title = pick(item, ['pblancNm', 'title']);
  if (!uid || !title) return null;

  const agency = pick(item, ['jrsdInsttNm', 'excInsttNm', 'organ']) ?? '미상';
  const category = pick(item, ['pldirSportRealmLclasCodeNm', 'category']);
  const target = pick(item, ['trgetNm', 'target', 'bsnsSumryCn']);
  const period = parsePeriod(pick(item, ['reqstBeginEndDe', 'rceptPd', 'period']) ?? undefined);
  const link = pick(item, ['pblancUrl', 'url']);

  return {
    source: 'bizinfo',
    source_uid: uid,
    title,
    agency,
    category,
    fund_type: guessFundType(`${title} ${category ?? ''}`),
    support_amount_min: null,
    support_amount_max: null,
    apply_start_at: period.start,
    apply_end_at: period.end,
    briefing_at: null,
    target_summary: target,
    url: link
      ? link.startsWith('http') ? link : `https://www.bizinfo.go.kr${link}`
      : 'https://www.bizinfo.go.kr',
    // 목록 API는 자격요건 원문을 주지 않는다. 요건을 구조화하지 못했으므로
    // 불변 규칙 2에 따라 'partial' 로 적재하고 매칭에서 '확인필요'로 내린다.
    parse_status: 'partial',
    raw: item,
    rules: [
      {
        label: '공고문 자격요건 확인 필요',
        field: 'manual',
        operator: 'unknown',
        value: null,
        is_disqualifier: 1,
        is_bonus: 0,
        source_text: target ?? '목록 API에는 자격요건 원문이 포함되지 않습니다. 공고문을 확인하십시오.',
      },
      ...(target ? deriveRulesFromTarget(target) : []),
    ],
  };
}

/**
 * 지원대상 요약문에서 결정적으로 뽑아낼 수 있는 요건만 추출한다.
 * 확신이 없으면 룰을 만들지 않는다 — 잘못된 '불가' 판정이 가장 큰 손해이기 때문이다.
 */
export function deriveRulesFromTarget(target: string): IncomingProgram['rules'] {
  const rules: IncomingProgram['rules'] = [];

  const years = target.match(/창업\s*(\d+)\s*년\s*(이내|미만)/);
  if (years) {
    rules.push({
      label: `업력 ${years[1]}년 이내`,
      field: 'founded_months',
      operator: years[2] === '미만' ? 'lt' : 'lte',
      value: Number(years[1]) * 12,
      is_disqualifier: 1,
      is_bonus: 0,
      source_text: years[0],
    });
  }

  const emp = target.match(/상시\s*근로자\s*(\d+)\s*[인명]\s*(이하|미만|이상)/);
  if (emp) {
    rules.push({
      label: `상시근로자 ${emp[1]}인 ${emp[2]}`,
      field: 'employees',
      operator: emp[2] === '이하' ? 'lte' : emp[2] === '미만' ? 'lt' : 'gte',
      value: Number(emp[1]),
      is_disqualifier: 1,
      is_bonus: 0,
      source_text: emp[0],
    });
  }

  if (/여성기업/.test(target)) {
    rules.push({
      label: '여성기업',
      field: 'is_woman_owned',
      operator: 'is_true',
      value: null,
      is_disqualifier: 0,
      is_bonus: 1,
      source_text: '여성기업 관련 문구가 지원대상에 포함되어 있습니다.',
    });
  }

  return rules;
}

export interface IngestReport {
  ok: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  message: string;
  sample?: unknown;
}

export async function ingestBizinfo(opts: { count?: number } = {}): Promise<IngestReport> {
  const key = process.env.BIZINFO_API_KEY;
  if (!key) {
    return { ok: false, fetched: 0, inserted: 0, updated: 0, message: 'BIZINFO_API_KEY 가 설정되지 않았습니다. .env 에 인증키를 넣고 다시 실행하십시오.' };
  }
  const base = process.env.BIZINFO_API_URL || 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';
  const url = `${base}?crtfcKey=${encodeURIComponent(key)}&dataType=json&searchCnt=${opts.count ?? 100}`;

  let json: unknown;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      return { ok: false, fetched: 0, inserted: 0, updated: 0, message: `HTTP ${res.status} — 인증키와 엔드포인트를 확인하십시오.` };
    }
    json = await res.json();
  } catch (err) {
    return { ok: false, fetched: 0, inserted: 0, updated: 0, message: `요청 실패: ${(err as Error).message}` };
  }

  // 응답 래핑 형태가 버전마다 달라 방어적으로 배열을 찾는다.
  const arr = findArray(json);
  if (!arr) {
    return {
      ok: false, fetched: 0, inserted: 0, updated: 0,
      message: '응답에서 공고 배열을 찾지 못했습니다. src/lib/ingest.ts 의 mapBizinfoItem 매핑을 실제 응답에 맞게 수정하십시오.',
      sample: json,
    };
  }

  const items = arr.map((r) => mapBizinfoItem(r as Record<string, unknown>)).filter((x): x is IncomingProgram => x !== null);
  if (items.length === 0) {
    return {
      ok: false, fetched: arr.length, inserted: 0, updated: 0,
      message: '배열은 찾았으나 필수 필드(pblancId/pblancNm)를 매핑하지 못했습니다. 아래 sample 을 보고 매핑을 수정하십시오.',
      sample: arr[0],
    };
  }

  const { inserted, updated } = upsertPrograms(items);
  return {
    ok: true, fetched: arr.length, inserted, updated,
    message: `${items.length}건 매핑 완료 (신규 ${inserted} / 갱신 ${updated}). 목록 API에는 자격요건 원문이 없어 모두 '확인필요'로 적재됩니다.`,
  };
}

function findArray(node: unknown, depth = 0): unknown[] | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) return node.length > 0 && typeof node[0] === 'object' ? node : null;
  if (node && typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = findArray(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
