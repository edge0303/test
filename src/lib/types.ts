// 도메인 타입 정의
// 설계 원칙: 매칭 판정은 결정적(deterministic) 이어야 하며, 모든 판정에 근거 문장이 붙는다.

export type Verdict = 'eligible' | 'needs_check' | 'ineligible';
export type CheckResult = 'PASS' | 'FAIL' | 'UNKNOWN';
export type FundType = 'grant' | 'loan' | 'guarantee' | 'voucher' | 'etc';
export type ParseStatus = 'parsed' | 'partial' | 'failed';

/** 값을 구간으로 다룬다. hi === null 이면 무한대. */
export interface Interval {
  lo: number;
  hi: number | null;
}

export interface Company {
  id: number;
  biz_no: string;
  name: string;
  status: string | null; // 계속사업자 / 휴업자 / 폐업자 / null(미확인)
  tax_type: string | null;
  industry_code: string | null; // 표준산업분류 (예: C10)
  industry_name: string | null;
  region_sido: string | null;
  region_sigungu: string | null;
  founded_at: string | null; // YYYY-MM-DD
  employee_band: string | null; // '1' | '2-4' | '5-9' | '10-49' | '50+'
  revenue_band: string | null; // '~1억' | '1-5억' | '5-10억' | '10-30억' | '30-100억' | '100억+'
  is_woman_owned: number | null;
  is_disabled_owned: number | null;
  is_social_enterprise: number | null;
  is_venture_certified: number | null;
  has_research_institute: number | null;
  profile_completeness: number;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: number;
  source: string; // 'seed' | 'bizinfo' | ...
  source_uid: string;
  title: string;
  agency: string;
  category: string | null;
  fund_type: FundType;
  support_amount_min: number | null; // 원
  support_amount_max: number | null; // 원
  apply_start_at: string | null; // YYYY-MM-DD
  apply_end_at: string | null;
  briefing_at: string | null;
  target_summary: string | null;
  url: string | null;
  parse_status: ParseStatus;
  fetched_at: string;
}

export type RuleField =
  | 'founded_months'
  | 'employees'
  | 'revenue_krw'
  | 'region_sido'
  | 'region_sigungu'
  | 'industry_code'
  | 'is_woman_owned'
  | 'is_disabled_owned'
  | 'is_social_enterprise'
  | 'is_venture_certified'
  | 'has_research_institute'
  | 'manual';

export type RuleOperator =
  | 'lte' | 'gte' | 'lt' | 'gt'
  | 'in' | 'not_in' | 'eq'
  | 'is_true'
  | 'prefix_in'
  | 'unknown';

export interface ProgramRule {
  id: number;
  program_id: number;
  label: string;          // 사용자에게 보여줄 요건 이름 (예: '업력 7년 이내')
  field: RuleField;
  operator: RuleOperator;
  value: string | null;   // JSON 문자열 또는 스칼라 문자열
  is_disqualifier: number; // 1이면 미충족 시 즉시 '불가'
  is_bonus: number;        // 1이면 가점 요건 (미충족해도 지원 가능)
  source_text: string;     // 공고 원문 근거 문장
}

export interface RuleEvaluation {
  rule: ProgramRule;
  result: CheckResult;
  required: string;  // 요건 표현
  actual: string;    // 우리 회사 값 표현
  note?: string;
}

export interface MatchResult {
  program: Program;
  verdict: Verdict;
  score: number;
  dday: number | null;
  evaluations: RuleEvaluation[];
  scoreBreakdown: { label: string; earned: number; max: number; note: string }[];
}

export type SectionKey = 'problem' | 'solution' | 'scaleup' | 'team';

export interface DraftSection {
  key: SectionKey;
  title: string;
  content: string;
}

export interface RubricCheck {
  id: string;
  label: string;
  weight: number;
  passed: boolean;
  fix: string; // 실행 가능한 수정 지시
}

export interface CriterionScore {
  key: SectionKey;
  label: string;
  score: number;
  max: number;
  checks: RubricCheck[];
  /** 미확인([확인 필요]) 항목에 대한 감점. 빈칸이 남아 있으면 만점을 줄 수 없다. */
  penalty: number;
  penaltyNote: string;
  comment: string;
}

export interface JudgeResult {
  total: number;
  max: number;
  criteria: CriterionScore[];
  passLine: number;
  /** 미확인 항목을 모두 채웠을 때 회복 가능한 점수 */
  recoverable: number;
  engine: 'deterministic' | 'deterministic+llm';
  narrative?: string;
}

export interface FactSlot {
  key: string;
  label: string;
  value: string | null;
  source: 'profile' | 'user' | null;
}

export interface UnverifiedNumber {
  section: SectionKey;
  snippet: string;
  reason: string;
}
