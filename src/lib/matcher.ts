import type {
  Company, Program, ProgramRule, MatchResult, RuleEvaluation, Verdict,
} from './types';
import { evaluateRule } from './rules';
import { bandInterval, REVENUE_BANDS } from './profile';

export function ddayOf(apply_end_at: string | null, today = new Date()): number | null {
  if (!apply_end_at) return null;
  const end = new Date(apply_end_at + 'T23:59:59');
  if (Number.isNaN(end.getTime())) return null;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t1 = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((t1 - t0) / 86_400_000);
}

/** 판정: 3단계 분류 */
export function decideVerdict(program: Program, evals: RuleEvaluation[]): Verdict {
  const hard = evals.filter((e) => !e.rule.is_bonus && e.rule.is_disqualifier);
  if (hard.some((e) => e.result === 'FAIL')) return 'ineligible';
  if (hard.some((e) => e.result === 'UNKNOWN')) return 'needs_check';
  // 불변 규칙 2: 파싱이 불완전한 공고는 자동으로 확인필요
  if (program.parse_status !== 'parsed') return 'needs_check';
  return 'eligible';
}

/**
 * 적합도 점수 (기획서 12.2)
 *  필수요건 충족률 40 / 가점요건 충족률 20 / 지원금 규모 적합도 15 / 마감 임박도 15 / 경쟁강도 10
 */
function scoreProgram(
  program: Program,
  company: Company,
  evals: RuleEvaluation[],
  dday: number | null,
) {
  const breakdown: MatchResult['scoreBreakdown'] = [];

  // 1) 필수요건 충족률 (40)
  const hard = evals.filter((e) => !e.rule.is_bonus);
  const hardPass = hard.filter((e) => e.result === 'PASS').length;
  const hardScore = hard.length === 0 ? 28 : Math.round((hardPass / hard.length) * 40);
  breakdown.push({
    label: '필수요건 충족',
    earned: hardScore,
    max: 40,
    note: hard.length === 0 ? '구조화된 필수요건 없음(기본값)' : `${hardPass} / ${hard.length}건 충족`,
  });

  // 2) 가점요건 충족률 (20)
  const bonus = evals.filter((e) => e.rule.is_bonus);
  const bonusPass = bonus.filter((e) => e.result === 'PASS').length;
  const bonusScore = bonus.length === 0 ? 10 : Math.round((bonusPass / bonus.length) * 20);
  breakdown.push({
    label: '가점요건 충족',
    earned: bonusScore,
    max: 20,
    note: bonus.length === 0 ? '가점 요건 없음(기본값)' : `${bonusPass} / ${bonus.length}건 충족`,
  });

  // 3) 지원금 규모 적합도 (15) — 기업 규모 대비 과대/과소 페널티
  const rev = bandInterval(REVENUE_BANDS, company.revenue_band);
  const amount = program.support_amount_max;
  let sizeScore = 9;
  let sizeNote = '매출 구간 또는 지원금 정보 부족(기본값)';
  if (rev && amount) {
    const revMid = rev.hi === null ? rev.lo * 1.5 : (rev.lo + rev.hi) / 2;
    const ratio = amount / Math.max(revMid, 1);
    if (ratio >= 0.03 && ratio <= 0.6) { sizeScore = 15; sizeNote = '기업 규모에 적정한 지원 규모'; }
    else if (ratio > 0.6 && ratio <= 1.5) { sizeScore = 11; sizeNote = '지원 규모가 큼 — 자부담·집행 역량 확인 필요'; }
    else if (ratio > 1.5) { sizeScore = 6; sizeNote = '기업 규모 대비 지원금이 과대 — 선정 경쟁 심화 가능'; }
    else { sizeScore = 7; sizeNote = '지원금 규모가 작아 실익이 제한적일 수 있음'; }
  }
  breakdown.push({ label: '지원 규모 적합도', earned: sizeScore, max: 15, note: sizeNote });

  // 4) 마감 임박도 (15) — 준비 불가능할 만큼 촉박하면 오히려 감점
  let ddayScore = 5;
  let ddayNote = '마감일 정보 없음';
  if (dday !== null) {
    if (dday < 0) { ddayScore = 0; ddayNote = '접수 마감'; }
    else if (dday <= 2) { ddayScore = 6; ddayNote = `D-${dday} — 준비 시간이 매우 촉박`; }
    else if (dday <= 7) { ddayScore = 15; ddayNote = `D-${dday} — 지금 준비하면 제출 가능`; }
    else if (dday <= 21) { ddayScore = 13; ddayNote = `D-${dday} — 준비 여유 있음`; }
    else if (dday <= 45) { ddayScore = 9; ddayNote = `D-${dday} — 여유 있음`; }
    else { ddayScore = 5; ddayNote = `D-${dday} — 아직 시간 많음`; }
  }
  breakdown.push({ label: '마감 임박도', earned: ddayScore, max: 15, note: ddayNote });

  // 5) 경쟁 강도 (10) — 대상이 좁을수록 경쟁이 덜하다고 본다
  const restrictive = evals.filter(
    (e) => !e.rule.is_bonus && ['region_sido', 'region_sigungu', 'industry_code'].includes(e.rule.field),
  ).length;
  const compScore = Math.min(10, 4 + restrictive * 3);
  breakdown.push({
    label: '경쟁 강도(추정)',
    earned: compScore,
    max: 10,
    note: restrictive === 0 ? '전국·전업종 공모 — 경쟁 높음' : `지역·업종 한정 ${restrictive}건 — 경쟁 완화`,
  });

  const total = breakdown.reduce((s, b) => s + b.earned, 0);
  return { total: Math.max(0, Math.min(100, total)), breakdown };
}

export function matchOne(
  company: Company,
  program: Program,
  rules: ProgramRule[],
  today = new Date(),
): MatchResult {
  const evaluations = rules.map((r) => evaluateRule(r, company));
  const verdict = decideVerdict(program, evaluations);
  const dday = ddayOf(program.apply_end_at, today);
  const { total, breakdown } = scoreProgram(program, company, evaluations, dday);
  return { program, verdict, score: total, dday, evaluations, scoreBreakdown: breakdown };
}

const VERDICT_ORDER: Record<Verdict, number> = { eligible: 0, needs_check: 1, ineligible: 2 };

export function sortMatches(list: MatchResult[]): MatchResult[] {
  return [...list].sort((a, b) => {
    if (VERDICT_ORDER[a.verdict] !== VERDICT_ORDER[b.verdict]) {
      return VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict];
    }
    return b.score - a.score;
  });
}

/** 대시보드 상단 '지금 해야 할 일' — 마감이 가깝고 적합도가 높은 순 */
export function actionCards(list: MatchResult[], limit = 3): MatchResult[] {
  return list
    .filter((m) => m.verdict !== 'ineligible' && m.dday !== null && m.dday >= 0)
    .sort((a, b) => {
      const ua = (a.dday ?? 999) * 2 - a.score / 10;
      const ub = (b.dday ?? 999) * 2 - b.score / 10;
      return ua - ub;
    })
    .slice(0, limit);
}
