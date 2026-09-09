import type { DraftSection, JudgeResult, CriterionScore, RubricCheck, SectionKey } from './types';

/**
 * 심사위원 엔진 (결정적).
 *
 * 설계 원칙 (기획서 13.3)
 *  1. 감점만 하고 가점하지 않는다 → 만점에서 출발해 결함마다 차감. 점수 인플레 방지.
 *  2. 모든 감점에 실행 가능한 수정 지시를 붙인다. "더 구체적으로" 같은 추상어 금지.
 *  3. 심사위원 페르소나: 해당 분야 10년차, 하루 40건을 읽고 3건만 통과시키는 사람.
 *
 * 결정적 채점을 1차 권위로 두는 이유: API 키 없이도 동작하고, 재작성기가
 * 정확히 어떤 결함을 고쳐야 하는지 기계적으로 알 수 있기 때문이다.
 */

export const PASS_LINE = 80;   // 통과 예상선 (사용자에게 보여주는 기준)
export const TARGET_SCORE = 85; // 재작성 루프 목표점

const NUM_WITH_UNIT = /\d[\d,.]*\s*(억원|천만원|백만원|만원|원|%|퍼센트|명|건|개|년|개월|배)/;

interface CheckDef {
  id: string;
  label: string;
  weight: number;
  test: (text: string) => boolean;
  fix: string;
}

const CHECKS: Record<SectionKey, { label: string; max: number; checks: CheckDef[] }> = {
  problem: {
    label: '문제인식',
    max: 20,
    checks: [
      {
        id: 'p_market',
        label: '목표 시장과 주요 고객이 명시되어 있는가',
        weight: 5,
        test: (t) => /목표 시장/.test(t) && /고객/.test(t),
        fix: '"목표 시장"과 "주요 고객"을 각각 한 문단으로 분리해 명시하고, 고객을 업종·규모·지역으로 한정해 기술하시오.',
      },
      {
        id: 'p_quant',
        label: '문제를 뒷받침하는 정량 근거가 있는가',
        weight: 5,
        test: (t) => NUM_WITH_UNIT.test(t),
        fix: '문제의 크기를 숫자로 제시하시오. (예: 불량률 %, 납기 지연 일수, 손실 금액) 근거 없는 숫자는 쓰지 말고 실제 사내 데이터를 사용하시오.',
      },
      {
        id: 'p_source',
        label: '시장 데이터의 출처가 표기되어 있는가',
        weight: 5,
        test: (t) => /출처\s*[:：]/.test(t),
        fix: '시장 규모·성장률 등 외부 인용 수치마다 "출처: 기관명, 발행연도" 를 문장 끝에 표기하시오. 출처를 댈 수 없으면 그 문장을 삭제하시오.',
      },
      {
        id: 'p_len',
        label: '분량이 심사에 충분한가 (400자 이상)',
        weight: 5,
        test: (t) => plain(t).length >= 400,
        fix: '문제 상황을 현장 사례 중심으로 400자 이상 서술하시오. 추상적 서술 대신 언제·어디서·무엇이 문제였는지 적으시오.',
      },
    ],
  },
  solution: {
    label: '실현가능성',
    max: 30,
    checks: [
      {
        id: 's_milestone',
        label: '월 단위 마일스톤과 산출물이 표로 제시되어 있는가',
        weight: 9,
        test: (t) => /마일스톤/.test(t) && /\|/.test(t),
        fix: '추진 일정을 분기가 아닌 월 단위 마일스톤 표로 바꾸고, 각 마일스톤마다 검증 가능한 산출물을 적으시오.',
      },
      {
        id: 's_capability',
        label: '보유 역량의 객관적 근거가 있는가',
        weight: 7,
        test: (t) => listItemWith(t, /(특허|인증|설비|수상|납품 실적|자격)/),
        fix: '보유 특허·인증·설비·납품 실적 중 실제 보유한 항목을 번호와 함께 나열하시오. 없으면 "없음"으로 적고 대신 확보 계획을 쓰시오.',
      },
      {
        id: 's_diff',
        label: '경쟁사 대비 차별성이 비교 형태로 서술되었는가',
        weight: 7,
        test: (t) => /(차별|경쟁사|대비)/.test(t) && /\|/.test(t),
        fix: '"당사 vs 경쟁사" 비교표를 넣고 항목별로 정량 비교하시오. 서술형 주장만으로는 심사에서 인정되지 않습니다.',
      },
      {
        id: 's_len',
        label: '분량이 심사에 충분한가 (500자 이상)',
        weight: 7,
        test: (t) => plain(t).length >= 500,
        fix: '추진 방안을 단계별로 나누어 500자 이상 구체화하시오. 각 단계에 투입 자원과 완료 기준을 적으시오.',
      },
    ],
  },
  scaleup: {
    label: '성장전략',
    max: 30,
    checks: [
      {
        id: 'g_assumption',
        label: '매출 추정의 가정이 명시되어 있는가',
        weight: 8,
        test: (t) => /가정/.test(t) && NUM_WITH_UNIT.test(t),
        fix: '매출 추정에 사용한 가정(단가, 물량, 가동률, 전환율)을 항목별로 명시하고 각 가정의 근거를 한 줄씩 적으시오.',
      },
      {
        id: 'g_budget',
        label: '자금 소요 내역이 표로 제시되어 있는가',
        weight: 8,
        test: (t) => /자금 소요/.test(t) && /\|/.test(t),
        fix: '"자금 소요 내역" 표를 만들고 항목·금액·산출근거 3열로 작성하시오. 합계가 지원 한도와 일치해야 합니다.',
      },
      {
        id: 'g_channel',
        label: '판로·고객 확보 방안이 있는가',
        weight: 7,
        test: (t) => /(판로|채널|고객 확보|영업)/.test(t),
        fix: '판로 확보 방안을 기존 거래처 확대 / 신규 채널 개척으로 나누고, 각각 목표 수치와 실행 방법을 적으시오.',
      },
      {
        id: 'g_len',
        label: '분량이 심사에 충분한가 (500자 이상)',
        weight: 7,
        test: (t) => plain(t).length >= 500,
        fix: '사업화 전략을 연차별로 나누어 500자 이상 서술하시오.',
      },
    ],
  },
  team: {
    label: '팀 구성',
    max: 20,
    checks: [
      {
        id: 't_table',
        label: '인력 구성이 역할과 함께 표로 제시되어 있는가',
        weight: 6,
        test: (t) => /역할/.test(t) && /\|/.test(t),
        fix: '"성명(직위) | 담당 역할 | 관련 경력" 3열 표로 핵심 인력을 정리하시오.',
      },
      {
        id: 't_ceo',
        label: '대표자의 관련 경력이 구체적인가',
        weight: 5,
        test: (t) => /대표/.test(t) && NUM_WITH_UNIT.test(t),
        fix: '대표자 경력을 "○○ 분야 N년" 형태로 연수와 함께 적고, 본 사업과의 연관성을 한 문장으로 덧붙이시오.',
      },
      {
        id: 't_partner',
        label: '외부 협력 체계가 있는가',
        weight: 5,
        test: (t) => /(협력|외주|자문|산학|컨소시엄|파트너)/.test(t),
        fix: '부족한 역량을 메울 외부 협력처(기관·업체·자문)를 명시하고 협력 형태를 적으시오. 없으면 확보 계획을 쓰시오.',
      },
      {
        id: 't_len',
        label: '분량이 심사에 충분한가 (300자 이상)',
        weight: 4,
        test: (t) => plain(t).length >= 300,
        fix: '조직 현황과 인력 운영 계획을 300자 이상으로 보강하시오.',
      },
    ],
  },
};

function plain(t: string): string {
  return t.replace(/[#*|>\-\s]/g, '');
}

/** 목록 항목(-, 1., ①) 안에 특정 표현이 있는지. 서술형 주장과 목록형 근거를 구분한다. */
function listItemWith(t: string, re: RegExp): boolean {
  return t
    .split('\n')
    .some((line) => /^\s*(?:[-*]|\d+[).]|[①②③④⑤])\s+/.test(line) && re.test(line));
}

function commentFor(key: SectionKey, failed: RubricCheck[]): string {
  if (failed.length === 0) return '심사 기준을 충족합니다.';
  const head = failed[0];
  return `${failed.length}개 항목에서 감점되었습니다. 가장 큰 감점 요인: ${head.label.replace(/는가$/, '지 않음')}`;
}

export function judgeDeterministic(sections: DraftSection[]): JudgeResult {
  const byKey = new Map(sections.map((s) => [s.key, s.content]));
  const criteria: CriterionScore[] = [];

  for (const meta of Object.keys(CHECKS) as SectionKey[]) {
    const def = CHECKS[meta];
    const text = byKey.get(meta) ?? '';
    const checks: RubricCheck[] = def.checks.map((c) => ({
      id: c.id,
      label: c.label,
      weight: c.weight,
      passed: text ? c.test(text) : false,
      fix: c.fix,
    }));
    // 만점에서 출발해 실패한 체크만큼 차감
    const lost = checks.filter((c) => !c.passed).reduce((s, c) => s + c.weight, 0);

    // 미확인 항목 감점: 형식만 갖추고 내용이 비어 있는 계획서에 만점을 줄 수는 없다.
    // 심사장에서 빈칸은 곧 "준비가 안 됐다"는 신호이기 때문이다.
    const markers = (text.match(/\[확인 필요:/g) ?? []).length;
    const penaltyCap = Math.round(def.max * 0.3);
    const penalty = Math.min(penaltyCap, markers * 2);

    criteria.push({
      key: meta,
      label: def.label,
      score: Math.max(0, def.max - lost - penalty),
      max: def.max,
      checks,
      penalty,
      penaltyNote: markers === 0
        ? '미확인 항목 없음'
        : `미확인 항목 ${markers}건 → -${penalty}점 (항목당 -2점, 최대 -${penaltyCap}점)`,
      comment: commentFor(meta, checks.filter((c) => !c.passed)),
    });
  }

  return {
    total: criteria.reduce((s, c) => s + c.score, 0),
    max: 100,
    criteria,
    passLine: PASS_LINE,
    recoverable: criteria.reduce((s, c) => s + c.penalty, 0),
    engine: 'deterministic',
  };
}

export function failedFixes(result: JudgeResult): { section: SectionKey; id: string; fix: string; label: string }[] {
  const out: { section: SectionKey; id: string; fix: string; label: string }[] = [];
  for (const c of result.criteria) {
    for (const chk of c.checks) {
      if (!chk.passed) out.push({ section: c.key, id: chk.id, fix: chk.fix, label: chk.label });
    }
  }
  return out;
}
