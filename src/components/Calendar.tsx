import type { MatchResult } from '@/lib/types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 접수시작 / 마감 / 설명회를 월간 그리드에 점으로 표시한다. */
export default function Calendar({ matches, today = new Date() }: { matches: MatchResult[]; today?: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const marks = new Map<string, { end: number; start: number; brief: number }>();
  const add = (date: string | null, kind: 'end' | 'start' | 'brief') => {
    if (!date) return;
    const cur = marks.get(date) ?? { end: 0, start: 0, brief: 0 };
    cur[kind]++;
    marks.set(date, cur);
  };
  for (const m of matches) {
    if (m.verdict === 'ineligible') continue;
    add(m.program.apply_end_at, 'end');
    add(m.program.apply_start_at, 'start');
    add(m.program.briefing_at, 'brief');
  }

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(<div className="cal-cell other" key={`p${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const mk = marks.get(iso);
    const isToday = d === today.getDate();
    cells.push(
      <div className={`cal-cell${mk ? ' has' : ''}${isToday ? ' today' : ''}`} key={iso}
        title={mk ? `마감 ${mk.end} · 접수시작 ${mk.start} · 설명회 ${mk.brief}` : undefined}>
        <span>{d}</span>
        <div className="cal-dots">
          {mk?.end ? <i className="cal-dot end" /> : null}
          {mk?.start ? <i className="cal-dot start" /> : null}
          {mk?.brief ? <i className="cal-dot brief" /> : null}
        </div>
      </div>,
    );
  }

  const monthEnds = [...marks.entries()].filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  const totalEnd = monthEnds.reduce((s, [, v]) => s + v.end, 0);
  const totalStart = monthEnds.reduce((s, [, v]) => s + v.start, 0);
  const totalBrief = monthEnds.reduce((s, [, v]) => s + v.brief, 0);

  return (
    <div className="card cal">
      <div className="cal-head">
        <b>{year}년 {month + 1}월</b>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          마감 {totalEnd} · 시작 {totalStart} · 설명회 {totalBrief}
        </span>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
        {cells}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: 'var(--urgent)' }} />마감</span>
        <span><i style={{ background: 'var(--ok)' }} />접수시작</span>
        <span><i style={{ background: 'var(--accent)' }} />설명회</span>
      </div>
    </div>
  );
}
