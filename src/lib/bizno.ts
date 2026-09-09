/**
 * 사업자등록번호 검증.
 * 국세청 체크섬 알고리즘: 가중치 [1,3,7,1,3,7,1,3,5] 를 앞 9자리에 곱해 합산하고,
 * 9번째 자리 * 5 의 십의 자리를 더한 뒤, (10 - 합계 % 10) % 10 이 10번째 자리와 같아야 한다.
 */
const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export function normalizeBizNo(input: string): string {
  return (input || '').replace(/\D/g, '');
}

export function formatBizNo(digits: string): string {
  const d = normalizeBizNo(digits);
  if (d.length !== 10) return digits;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export function isValidBizNo(input: string): boolean {
  const d = normalizeBizNo(input);
  if (d.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(d)) return false; // 0000000000 같은 값 배제

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * WEIGHTS[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[9]);
}

/** 사업자번호 앞 5자리 중 3~5번째(사업자 구분코드)로 개인/법인 구분 */
export function bizNoKind(input: string): '개인' | '법인' | '기타' | null {
  const d = normalizeBizNo(input);
  if (d.length !== 10) return null;
  const code = Number(d.slice(3, 5));
  if (code >= 1 && code <= 79) return '개인';
  if (code === 80) return '기타'; // 아파트관리사무소 등
  if (code >= 81 && code <= 88) return '법인';
  if (code >= 89 && code <= 99) return '개인'; // 종교단체/법인이 아닌 단체 등
  return '기타';
}
