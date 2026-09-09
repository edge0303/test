/**
 * 국세청 사업자등록 상태조회 (선택적).
 * 공공데이터포털 'nts-businessman' 서비스 사용.
 *
 * 중요 — 이 API로 알 수 있는 것은 사실상 휴폐업 상태와 과세유형뿐이다.
 * 업종·업력·매출·근로자수는 나오지 않는다. 그래서 온보딩이 '하이브리드'다.
 * (기획서 병목 B1)
 */

const ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/status';

export interface NtsStatus {
  available: boolean;   // API 키가 있어 실제 조회를 수행했는가
  found: boolean;
  b_stt: string | null;      // 계속사업자 / 휴업자 / 폐업자
  tax_type: string | null;   // 부가가치세 일반과세자 등
  end_dt: string | null;     // 폐업일
  message: string;
}

export async function lookupBizStatus(bizNo10: string): Promise<NtsStatus> {
  const key = process.env.NTS_API_KEY;
  if (!key) {
    return {
      available: false, found: false, b_stt: null, tax_type: null, end_dt: null,
      message: '국세청 조회 키가 없어 형식 검증만 수행했습니다. (NTS_API_KEY 설정 시 휴폐업 상태를 자동 확인합니다)',
    };
  }

  try {
    const res = await fetch(`${ENDPOINT}?serviceKey=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ b_no: [bizNo10] }),
    });
    if (!res.ok) {
      return {
        available: true, found: false, b_stt: null, tax_type: null, end_dt: null,
        message: `국세청 조회 실패 (HTTP ${res.status}). 입력값은 형식 검증만 통과한 상태입니다.`,
      };
    }
    const json = (await res.json()) as { data?: Record<string, string>[] };
    const row = json.data?.[0];
    if (!row || !row.b_stt_cd || row.b_stt_cd === '') {
      return {
        available: true, found: false, b_stt: null, tax_type: null, end_dt: null,
        message: '국세청에 등록되지 않은 사업자번호입니다. 번호를 다시 확인해 주세요.',
      };
    }
    return {
      available: true,
      found: true,
      b_stt: row.b_stt ?? null,
      tax_type: row.tax_type ?? null,
      end_dt: row.end_dt || null,
      message: `국세청 조회 완료: ${row.b_stt ?? '상태 미상'}`,
    };
  } catch (err) {
    return {
      available: true, found: false, b_stt: null, tax_type: null, end_dt: null,
      message: `국세청 조회 중 오류가 발생해 형식 검증만 적용했습니다. (${(err as Error).message})`,
    };
  }
}
