import type { DraftSection, FactSlot, UnverifiedNumber, SectionKey } from './types';

/**
 * 팩트체커.
 * 최종 산출물의 모든 수치를 프로파일(팩트 슬롯)과 전수 대조한다.
 * 대조 불가 항목은 제출 전 반드시 확인해야 할 대상으로 표시한다.
 * 매출·특허·인력 같은 숫자를 지어내면 그 자체가 탈락 사유이기 때문이다.
 */

/*
 * 정규식의 모든 수량자에 상한을 둔다.
 *
 * 상한이 없으면 단위가 붙지 않는 긴 숫자열에서 이차 시간이 된다.
 * `\d[\d,]*` 가 매 시작 위치마다 문자열 끝까지 탐욕적으로 먹은 뒤,
 * 뒤따르는 단위 매칭에 실패하며 한 글자씩 되돌아오기 때문이다.
 * (측정: 120KB 입력에 14.5초 — 요청 하나로 CPU 코어 하나를 점유)
 *
 * 상한을 두면 위치당 되돌림이 상수로 묶여 전체가 선형이 된다.
 * 20자리를 넘는 금액은 실무에 존재하지 않으므로 판정 정확도에 영향이 없다.
 */
const NUM_UNIT_RE = /(\d[\d,]{0,19}(?:\.\d{1,6})?)\s{0,4}(억원|천만원|백만원|만원|원|%|퍼센트|명|건|개월|년|개|배)/g;
const MARKER_RE = /\[확인 필요:\s{0,4}([^\]]{1,200})\]/g;

function normalize(s: string): string {
  return s.replace(/[\s,]/g, '');
}

export interface VerifyReport {
  unresolvedMarkers: { section: SectionKey; label: string }[];
  unverifiedNumbers: UnverifiedNumber[];
  verifiedCount: number;
}

export function verify(sections: DraftSection[], slots: FactSlot[]): VerifyReport {
  const slotBlob = normalize(slots.map((s) => s.value ?? '').join(' | '));
  const unresolvedMarkers: { section: SectionKey; label: string }[] = [];
  const unverifiedNumbers: UnverifiedNumber[] = [];
  let verifiedCount = 0;

  for (const sec of sections) {
    for (const m of sec.content.matchAll(MARKER_RE)) {
      unresolvedMarkers.push({ section: sec.key, label: m[1].trim() });
    }

    // 마커 안의 숫자는 이미 '확인 필요' 로 잡혔으므로 중복 계산하지 않는다.
    const stripped = sec.content.replace(MARKER_RE, ' ');
    for (const m of stripped.matchAll(NUM_UNIT_RE)) {
      const token = normalize(m[0]);
      if (slotBlob.includes(token) || slotBlob.includes(normalize(m[1]))) {
        verifiedCount++;
        continue;
      }
      unverifiedNumbers.push({
        section: sec.key,
        snippet: contextOf(stripped, m.index ?? 0, m[0].length),
        reason: '입력하신 기업 정보와 대조할 수 없는 수치입니다. 근거를 넣거나 삭제하세요.',
      });
    }
  }

  return { unresolvedMarkers, unverifiedNumbers, verifiedCount };
}

function contextOf(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 25);
  const end = Math.min(text.length, index + len + 25);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\n/g, ' ').trim() + (end < text.length ? '…' : '');
}

/** 제출 가능 여부 게이트: 미해결 항목이 있으면 제출 전 처리해야 한다. */
export function submissionBlockers(report: VerifyReport): number {
  return report.unresolvedMarkers.length + report.unverifiedNumbers.length;
}
