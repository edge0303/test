import type { Company, Program, FactSlot, DraftSection, SectionKey } from './types';
import { bandLabel, EMPLOYEE_BANDS, REVENUE_BANDS, foundedLabel, formatKRW } from './profile';

export const SECTION_META: { key: SectionKey; title: string; question: string }[] = [
  { key: 'problem', title: 'P. 문제인식', question: '왜 이 사업이 필요한가, 시장의 문제는 무엇인가' },
  { key: 'solution', title: 'S. 실현가능성', question: '어떻게 만들 것인가, 기술·역량은 있는가' },
  { key: 'scaleup', title: 'S. 성장전략', question: '어떻게 팔고 얼마나 벌 것인가, 자금은 어디에 쓰는가' },
  { key: 'team', title: 'T. 팀 구성', question: '누가 하는가, 왜 이 팀이 할 수 있는가' },
];

/**
 * 팩트 슬롯 규약 (환각 방지의 핵심)
 * - 초안 생성기는 숫자를 직접 쓸 수 없고 {{fact:key}} 슬롯만 사용한다.
 * - 슬롯 값이 없으면 문장을 만들지 않고 [확인 필요: 라벨] 마커를 남긴다.
 */
export function buildFactSlots(c: Company, p: Program): FactSlot[] {
  return [
    { key: 'company_name', label: '기업명', value: c.name || null, source: c.name ? 'profile' : null },
    { key: 'industry', label: '업종', value: c.industry_name, source: c.industry_name ? 'profile' : null },
    { key: 'region', label: '소재지', value: [c.region_sido, c.region_sigungu].filter(Boolean).join(' ') || null, source: c.region_sido ? 'profile' : null },
    { key: 'age', label: '업력', value: c.founded_at ? foundedLabel(c.founded_at) : null, source: c.founded_at ? 'profile' : null },
    { key: 'employees', label: '상시근로자 수', value: c.employee_band ? bandLabel(EMPLOYEE_BANDS, c.employee_band) : null, source: c.employee_band ? 'profile' : null },
    { key: 'revenue', label: '직전연도 매출', value: c.revenue_band ? bandLabel(REVENUE_BANDS, c.revenue_band) : null, source: c.revenue_band ? 'profile' : null },
    { key: 'support_amount', label: '지원 한도', value: p.support_amount_max ? formatKRW(p.support_amount_max) : null, source: p.support_amount_max ? 'profile' : null },
    { key: 'program_title', label: '사업명', value: p.title, source: 'profile' },
    { key: 'agency', label: '주관기관', value: p.agency, source: 'profile' },
    // 아래 항목은 프로파일에 없다. 값을 넣지 않으면 문장이 생성되지 않고 [확인 필요] 로 남는다.
    { key: 'market_size', label: '목표 시장 규모(출처 포함)', value: null, source: null },
    { key: 'customer_count', label: '확보 고객 수', value: null, source: null },
    { key: 'patents', label: '보유 특허·인증', value: null, source: null },
    { key: 'target_revenue', label: '3년 후 목표 매출', value: null, source: null },
  ];
}

const SLOT_RE = /\{\{fact:([a-z_]+)\}\}/g;

export function renderSlots(text: string, slots: FactSlot[]): string {
  const map = new Map(slots.map((s) => [s.key, s]));
  return text.replace(SLOT_RE, (_m, key: string) => {
    const slot = map.get(key);
    if (slot?.value) return slot.value;
    return `[확인 필요: ${slot?.label ?? key}]`;
  });
}

export function missingSlots(text: string, slots: FactSlot[]): FactSlot[] {
  const map = new Map(slots.map((s) => [s.key, s]));
  const used = new Set<string>();
  for (const m of text.matchAll(SLOT_RE)) used.add(m[1]);
  return [...used].map((k) => map.get(k)).filter((s): s is FactSlot => Boolean(s) && !s!.value);
}

/* ------------------------------------------------------------------ *
 * 결정적 템플릿 초안 (API 키 없이도 전체 흐름이 동작하도록)
 * 일부러 '초안 수준' 으로 만든다. 심사 루프가 무엇을 고치는지 보여주기 위함이다.
 * ------------------------------------------------------------------ */
export function templateDraft(c: Company, p: Program): DraftSection[] {
  const fund = p.fund_type === 'loan' ? '정책자금(융자)' : '지원금';
  return [
    {
      key: 'problem',
      title: 'P. 문제인식',
      content:
`### 1. 창업/사업 배경 및 필요성
{{fact:company_name}}은(는) {{fact:region}}에 소재한 {{fact:industry}} 기업으로, 현재 업력 {{fact:age}}, 직전연도 매출 {{fact:revenue}} 규모입니다.

현장에서 확인한 문제는 다음 세 가지입니다.
- 첫째, 수요는 늘고 있으나 기존 생산·서비스 방식으로는 납기와 품질을 동시에 맞추기 어렵습니다.
- 둘째, 단가 경쟁이 심화되면서 개선 투자 여력이 줄어드는 악순환이 발생하고 있습니다.
- 셋째, 개선에 필요한 초기 비용을 자체 자금만으로 감당하기 어렵습니다.

### 2. 목표 시장과 주요 고객
목표 시장은 {{fact:market_size}} 규모이며, 주요 고객은 {{fact:region}} 인근의 거래처입니다. 현재 확보 고객 수는 {{fact:customer_count}}입니다.

### 3. 본 사업과의 연계
「{{fact:program_title}}」({{fact:agency}})의 ${fund}을 활용해 위 문제를 해결하고자 합니다.`,
    },
    {
      key: 'solution',
      title: 'S. 실현가능성',
      content:
`### 1. 사업 추진 방안
본 사업으로 다음을 추진합니다.
- 핵심 공정/서비스 개선 및 필요한 설비·시스템 도입
- 품질 관리 체계 정비
- 개선 결과의 표준화 및 사내 확산

### 2. 보유 역량
{{fact:company_name}}은(는) 업력 {{fact:age}} 동안 축적한 현장 운영 경험을 보유하고 있습니다. 보유 특허·인증은 {{fact:patents}}입니다.

### 3. 차별성
동종 업체 대비 차별점은 현장 데이터를 기반으로 개선 지점을 특정할 수 있다는 점입니다.`,
    },
    {
      key: 'scaleup',
      title: 'S. 성장전략',
      content:
`### 1. 사업화 전략
개선된 생산·서비스 역량을 바탕으로 기존 거래처 물량을 확대하고 신규 거래처를 발굴합니다.

### 2. 매출 목표
3년 후 목표 매출은 {{fact:target_revenue}}입니다.

### 3. 자금 활용 계획
본 사업의 지원 한도는 {{fact:support_amount}}이며, 설비·시스템 도입과 운영 개선에 사용할 계획입니다.`,
    },
    {
      key: 'team',
      title: 'T. 팀 구성',
      content:
`### 1. 조직 현황
현재 상시근로자는 {{fact:employees}}입니다.

### 2. 대표자 역량
대표자는 해당 분야에서 사업을 운영하며 현장 전반을 총괄해 왔습니다.

### 3. 인력 운영 계획
본 사업 수행에 필요한 인력을 내부 인력 중심으로 배치할 계획입니다.`,
    },
  ];
}
