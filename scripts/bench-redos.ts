/**
 * ReDoS 벤치마크.
 * 채점(judge)과 팩트체크(verify)가 입력 크기에 대해 선형으로 동작하는지 확인한다.
 * 이차 시간이면 입력이 2배가 될 때 시간이 4배로 늘어난다.
 */
import { judgeDeterministic } from '../src/lib/judge';
import { verify } from '../src/lib/verifier';
import type { DraftSection, FactSlot } from '../src/lib/types';

const slots: FactSlot[] = [{ key: 'revenue', label: '매출', value: '5억 ~ 10억', source: 'profile' }];
const mk = (payload: string): DraftSection[] => ([
  { key: 'problem', title: 'P', content: payload },
  { key: 'solution', title: 'S', content: 'x' },
  { key: 'scaleup', title: 'S', content: 'x' },
  { key: 'team', title: 'T', content: 'x' },
]);

function time(label: string, fn: () => void): number {
  const t0 = process.hrtime.bigint();
  fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  ${label.padEnd(30)} ${ms.toFixed(1).padStart(8)} ms`);
  return ms;
}

const SIZES = [15_000, 30_000, 60_000, 120_000];

console.log('\n[공격 페이로드] 단위가 붙지 않는 긴 숫자열');
const attack: number[] = [];
for (const n of SIZES) {
  const s = mk('1'.repeat(n));
  attack.push(time(`${(n / 1000).toFixed(0)}KB`, () => { judgeDeterministic(s); verify(s, slots); }));
}
console.log('  입력 2배당 증가율:',
  attack.slice(1).map((t, i) => `${(t / attack[i]).toFixed(1)}배`).join(' → '),
  '  (선형이면 2배 안팎, 이차면 4배)');

console.log('\n[공격 페이로드] 닫는 괄호가 없는 확인필요 마커');
const marker: number[] = [];
for (const n of SIZES) {
  const s = mk('[확인 필요:'.repeat(Math.round(n / 8)));
  marker.push(time(`${(n / 1000).toFixed(0)}KB`, () => { judgeDeterministic(s); verify(s, slots); }));
}
console.log('  입력 2배당 증가율:',
  marker.slice(1).map((t, i) => `${(t / marker[i]).toFixed(1)}배`).join(' → '));

console.log('\n[정상 문서] 같은 길이의 한국어 본문');
for (const n of [60_000, 120_000]) {
  const s = mk('현장에서 확인한 문제는 납기 지연 3일과 불량률 2% 입니다. '.repeat(Math.round(n / 30)));
  time(`${(n / 1000).toFixed(0)}KB`, () => { judgeDeterministic(s); verify(s, slots); });
}

const worst = Math.max(attack[attack.length - 1], marker[marker.length - 1]);
console.log(`\n최대 입력(120KB) 처리 시간: ${worst.toFixed(0)}ms`);
if (worst > 1000) {
  console.log('→ 1초를 넘습니다. 요청 하나가 CPU를 점유할 수 있습니다.');
  process.exitCode = 1;
} else {
  console.log('→ 1초 미만. 선형 동작으로 확인됩니다.');
}
