import type { Company, Interval } from './types';

/**
 * 온보딩에서 정확한 숫자 대신 '구간'을 받는다. (대표님이 정확한 값을 몰라 이탈하는 것이 최대 손실)
 * 대신 매칭은 구간 전체가 요건을 만족할 때만 PASS, 전체가 위배할 때만 FAIL,
 * 걸쳐 있으면 UNKNOWN(=확인필요) 으로 판정한다. 이것이 3단계 분류의 수학적 근거다.
 */

export const EMPLOYEE_BANDS: { value: string; label: string; interval: Interval }[] = [
  { value: '1', label: '대표 1인', interval: { lo: 1, hi: 1 } },
  { value: '2-4', label: '2~4명', interval: { lo: 2, hi: 4 } },
  { value: '5-9', label: '5~9명', interval: { lo: 5, hi: 9 } },
  { value: '10-49', label: '10~49명', interval: { lo: 10, hi: 49 } },
  { value: '50-99', label: '50~99명', interval: { lo: 50, hi: 99 } },
  { value: '100+', label: '100명 이상', interval: { lo: 100, hi: null } },
];

const EOK = 100_000_000; // 1억
export const REVENUE_BANDS: { value: string; label: string; interval: Interval }[] = [
  { value: '~1억', label: '1억 미만', interval: { lo: 0, hi: EOK - 1 } },
  { value: '1-5억', label: '1억 ~ 5억', interval: { lo: EOK, hi: 5 * EOK } },
  { value: '5-10억', label: '5억 ~ 10억', interval: { lo: 5 * EOK, hi: 10 * EOK } },
  { value: '10-30억', label: '10억 ~ 30억', interval: { lo: 10 * EOK, hi: 30 * EOK } },
  { value: '30-100억', label: '30억 ~ 100억', interval: { lo: 30 * EOK, hi: 100 * EOK } },
  { value: '100억+', label: '100억 이상', interval: { lo: 100 * EOK, hi: null } },
];

export const SIDO = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

/** 표준산업분류 대분류 (온보딩 선택지) */
export const INDUSTRIES: { code: string; name: string }[] = [
  { code: 'A', name: '농업·임업·어업' },
  { code: 'C10', name: '제조업 - 식료품' },
  { code: 'C20', name: '제조업 - 화학·의약' },
  { code: 'C25', name: '제조업 - 금속가공(뿌리산업)' },
  { code: 'C26', name: '제조업 - 전자·반도체' },
  { code: 'C28', name: '제조업 - 전기장비' },
  { code: 'C29', name: '제조업 - 기계·장비' },
  { code: 'C30', name: '제조업 - 자동차·운송장비' },
  { code: 'C', name: '제조업 - 기타' },
  { code: 'F', name: '건설업' },
  { code: 'G', name: '도매 및 소매업' },
  { code: 'H', name: '운수 및 창고업' },
  { code: 'I', name: '숙박 및 음식점업' },
  { code: 'J', name: '정보통신업(SW·콘텐츠)' },
  { code: 'M', name: '전문·과학·기술 서비스업' },
  { code: 'N', name: '사업시설관리·사업지원 서비스업' },
  { code: 'P', name: '교육 서비스업' },
  { code: 'Q', name: '보건업 및 사회복지 서비스업' },
  { code: 'R', name: '예술·스포츠·여가' },
  { code: 'S', name: '협회·수리·기타 개인 서비스업' },
];

export function bandInterval(
  bands: { value: string; interval: Interval }[],
  value: string | null,
): Interval | null {
  if (!value) return null;
  return bands.find((b) => b.value === value)?.interval ?? null;
}

export function bandLabel(
  bands: { value: string; label: string }[],
  value: string | null,
): string {
  if (!value) return '미입력';
  return bands.find((b) => b.value === value)?.label ?? value;
}

/** 개업일 기준 업력(개월). 미입력이면 null. */
export function foundedMonths(founded_at: string | null, now = new Date()): number | null {
  if (!founded_at) return null;
  const d = new Date(founded_at + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  return Math.max(0, months);
}

export function foundedLabel(founded_at: string | null): string {
  const m = foundedMonths(founded_at);
  if (m === null) return '미입력';
  return `${Math.floor(m / 12)}년 ${m % 12}개월`;
}

/**
 * 프로파일 완성도. 매칭 정확도를 사용자에게 정직하게 알리기 위한 지표.
 * 완성도가 낮으면 '확인필요' 가 늘어난다는 것을 UI에서 설명한다.
 */
export function computeCompleteness(c: Partial<Company>): number {
  const fields: (keyof Company)[] = [
    'industry_code', 'region_sido', 'region_sigungu',
    'founded_at', 'employee_band', 'revenue_band',
  ];
  const filled = fields.filter((f) => c[f] !== null && c[f] !== undefined && c[f] !== '').length;
  const flagsAnswered = c.is_woman_owned !== null && c.is_woman_owned !== undefined;
  return Math.round(((filled + (flagsAnswered ? 1 : 0)) / (fields.length + 1)) * 100);
}

export function formatKRW(won: number | null): string {
  if (won === null || won === undefined) return '미정';
  if (won >= EOK) {
    const eok = won / EOK;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억원`;
  }
  if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString()}만원`;
  return `${won.toLocaleString()}원`;
}
