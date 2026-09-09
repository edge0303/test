import type { Company, Interval, ProgramRule, RuleEvaluation, CheckResult } from './types';
import {
  EMPLOYEE_BANDS, REVENUE_BANDS, bandInterval, bandLabel,
  foundedMonths, foundedLabel, formatKRW,
} from './profile';

/**
 * 결정적 룰 평가기. LLM을 쓰지 않는다.
 * "왜 이 공고가 떴는지" 를 설명할 수 없으면 서비스 신뢰가 무너지기 때문이다.
 *
 * 불변 규칙
 *  1. UNKNOWN 은 절대 FAIL 로 취급하지 않는다.
 *  2. 파싱이 불완전한 공고는 자동으로 '확인필요' 로 내린다. (matcher 에서 처리)
 *  3. 가점 요건 미충족은 판정에 영향을 주지 않고 점수에만 반영한다.
 */

function parseValue(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function intervalLabel(iv: Interval | null, fmt: (n: number) => string): string {
  if (!iv) return '미입력';
  if (iv.hi === null) return `${fmt(iv.lo)} 이상`;
  if (iv.lo === iv.hi) return fmt(iv.lo);
  return `${fmt(iv.lo)} ~ ${fmt(iv.hi)}`;
}

/** 구간 비교: 구간 전체가 만족하면 PASS, 전체가 위배하면 FAIL, 걸치면 UNKNOWN */
function compareInterval(iv: Interval | null, op: string, v: number): CheckResult {
  if (!iv) return 'UNKNOWN';
  switch (op) {
    case 'lte':
      if (iv.hi !== null && iv.hi <= v) return 'PASS';
      if (iv.lo > v) return 'FAIL';
      return 'UNKNOWN';
    case 'lt':
      if (iv.hi !== null && iv.hi < v) return 'PASS';
      if (iv.lo >= v) return 'FAIL';
      return 'UNKNOWN';
    case 'gte':
      if (iv.lo >= v) return 'PASS';
      if (iv.hi !== null && iv.hi < v) return 'FAIL';
      return 'UNKNOWN';
    case 'gt':
      if (iv.lo > v) return 'PASS';
      if (iv.hi !== null && iv.hi <= v) return 'FAIL';
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

const OP_TEXT: Record<string, string> = {
  lte: '이하', lt: '미만', gte: '이상', gt: '초과',
};

function flagEval(flag: number | null | undefined, label: string): { result: CheckResult; actual: string } {
  if (flag === null || flag === undefined) return { result: 'UNKNOWN', actual: '미응답' };
  return { result: flag ? 'PASS' : 'FAIL', actual: flag ? `해당 (${label})` : '해당 없음' };
}

export function evaluateRule(rule: ProgramRule, c: Company): RuleEvaluation {
  const value = parseValue(rule.value);
  const base = { rule, required: rule.label };

  switch (rule.field) {
    case 'founded_months': {
      const m = foundedMonths(c.founded_at);
      const iv: Interval | null = m === null ? null : { lo: m, hi: m };
      const n = Number(value);
      const result = compareInterval(iv, rule.operator, n);
      return {
        ...base,
        result,
        required: `업력 ${Math.floor(n / 12)}년 ${OP_TEXT[rule.operator] ?? rule.operator}`,
        actual: foundedLabel(c.founded_at),
      };
    }
    case 'employees': {
      const iv = bandInterval(EMPLOYEE_BANDS, c.employee_band);
      const n = Number(value);
      const result = compareInterval(iv, rule.operator, n);
      return {
        ...base,
        result,
        required: `상시근로자 ${n}명 ${OP_TEXT[rule.operator] ?? rule.operator}`,
        actual: bandLabel(EMPLOYEE_BANDS, c.employee_band),
        note: result === 'UNKNOWN' && iv ? '선택하신 구간이 기준선에 걸쳐 있어 정확한 인원 확인이 필요합니다.' : undefined,
      };
    }
    case 'revenue_krw': {
      const iv = bandInterval(REVENUE_BANDS, c.revenue_band);
      const n = Number(value);
      const result = compareInterval(iv, rule.operator, n);
      return {
        ...base,
        result,
        required: `매출액 ${formatKRW(n)} ${OP_TEXT[rule.operator] ?? rule.operator}`,
        actual: intervalLabel(iv, formatKRW),
        note: result === 'UNKNOWN' && iv ? '선택하신 매출 구간이 기준선에 걸쳐 있어 확인이 필요합니다.' : undefined,
      };
    }
    case 'region_sido':
    case 'region_sigungu': {
      const actual = rule.field === 'region_sido' ? c.region_sido : c.region_sigungu;
      const list: string[] = Array.isArray(value) ? value : [String(value)];
      let result: CheckResult;
      if (!actual) result = 'UNKNOWN';
      else if (rule.operator === 'not_in') result = list.some((v) => actual.includes(v)) ? 'FAIL' : 'PASS';
      else result = list.some((v) => actual.includes(v) || v.includes(actual)) ? 'PASS' : 'FAIL';
      return { ...base, result, required: `소재지 ${list.join(' 또는 ')}`, actual: actual ?? '미입력' };
    }
    case 'industry_code': {
      const list: string[] = Array.isArray(value) ? value : [String(value)];
      const code = c.industry_code;
      let result: CheckResult;
      if (!code) result = 'UNKNOWN';
      else if (rule.operator === 'not_in') result = list.some((p) => code.startsWith(p)) ? 'FAIL' : 'PASS';
      else result = list.some((p) => code.startsWith(p) || p.startsWith(code)) ? 'PASS' : 'FAIL';
      return {
        ...base,
        result,
        required: `업종 ${list.join(', ')}`,
        actual: c.industry_name ? `${c.industry_name} (${code})` : '미입력',
      };
    }
    case 'is_woman_owned': {
      const r = flagEval(c.is_woman_owned, '여성기업');
      return { ...base, result: r.result, required: '여성기업', actual: r.actual };
    }
    case 'is_disabled_owned': {
      const r = flagEval(c.is_disabled_owned, '장애인기업');
      return { ...base, result: r.result, required: '장애인기업', actual: r.actual };
    }
    case 'is_social_enterprise': {
      const r = flagEval(c.is_social_enterprise, '사회적기업');
      return { ...base, result: r.result, required: '사회적기업', actual: r.actual };
    }
    case 'is_venture_certified': {
      const r = flagEval(c.is_venture_certified, '벤처기업 인증');
      return { ...base, result: r.result, required: '벤처기업 인증 보유', actual: r.actual };
    }
    case 'has_research_institute': {
      const r = flagEval(c.has_research_institute, '기업부설연구소');
      return { ...base, result: r.result, required: '기업부설연구소 보유', actual: r.actual };
    }
    case 'manual':
    default:
      // 자동 판정이 불가능한 요건. 버리지 않고 '확인필요' 로 남긴다.
      return {
        ...base,
        result: 'UNKNOWN',
        required: rule.label,
        actual: '자동 판정 불가',
        note: '공고 원문에서 직접 확인이 필요한 요건입니다.',
      };
  }
}
