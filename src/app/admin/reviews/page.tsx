import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { listExpertQueue } from '@/lib/repo';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { queued: '대기', in_progress: '검수 중', done: '완료' };

/**
 * 내부 운영 화면 — 전문가 검수 큐.
 * 초기에는 내부 인력이 직접 검수하고, 그 기록을 학습 자산으로 축적한다. (기획서 16장)
 * 실제 운영 시에는 이 경로에 인증을 반드시 걸어야 한다.
 */
export default function AdminReviews() {
  const queue = listExpertQueue();
  const memos = new Map(
    (getDb().prepare('SELECT id, memo FROM expert_reviews').all() as { id: number; memo: string | null }[])
      .map((r) => [r.id, r.memo]),
  );

  const counts = {
    queued: queue.filter((q) => q.status === 'queued').length,
    in_progress: queue.filter((q) => q.status === 'in_progress').length,
    done: queue.filter((q) => q.status === 'done').length,
  };

  return (
    <>
      <TopBar />
      <div className="wrap">
        <div className="section-title" style={{ marginTop: 24 }}>
          전문가 검수 큐
          <small>내부 운영용 · 실제 배포 시 접근 제어 필요</small>
        </div>

        <div className="kpis" style={{ marginTop: 0, gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="card kpi"><div className="v" style={{ color: 'var(--warn)' }}>{counts.queued}</div><div className="l">대기</div></div>
          <div className="card kpi"><div className="v" style={{ color: 'var(--accent)' }}>{counts.in_progress}</div><div className="l">검수 중</div></div>
          <div className="card kpi"><div className="v" style={{ color: 'var(--ok)' }}>{counts.done}</div><div className="l">완료</div></div>
        </div>

        <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
          {queue.length === 0 ? (
            <div className="empty">접수된 검수 요청이 없습니다.</div>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th>상태</th><th>기업</th><th>공고</th><th>점수</th>
                  <th>요청일</th><th>기한</th><th>담당</th><th>처리</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <span className={`badge ${q.status === 'done' ? 'ok' : q.status === 'in_progress' ? 'accent' : 'warn'}`}>
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </td>
                    <td>{q.company}</td>
                    <td style={{ maxWidth: 260 }}>
                      <Link href={`/application/${q.application_id}`}>{q.title}</Link>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{q.score ?? '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{q.requested_at.slice(0, 10)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{q.due_at ?? '-'}</td>
                    <td style={{ fontSize: 12 }}>{q.assignee ?? '-'}</td>
                    <td>
                      <form action="/api/admin/review" method="post" style={{ display: 'flex', gap: 4 }}>
                        <input type="hidden" name="id" value={q.id} />
                        <input type="text" name="assignee" placeholder="담당자"
                          defaultValue={q.assignee ?? ''} style={{ width: 80, padding: '4px 6px', fontSize: 12 }} />
                        <select name="status" defaultValue={q.status} style={{ width: 92, padding: '4px 6px', fontSize: 12 }}>
                          <option value="queued">대기</option>
                          <option value="in_progress">검수 중</option>
                          <option value="done">완료</option>
                        </select>
                        <button className="btn sm" type="submit">저장</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {queue.map((q) => (
          <details className="card" key={`memo-${q.id}`} style={{ marginTop: 12, padding: '12px 16px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              자동 사전정리 — {q.company} / {q.title}
            </summary>
            <pre style={{
              whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-2)',
              marginTop: 10, fontFamily: 'ui-monospace, Menlo, monospace', lineHeight: 1.7,
            }}>
              {memos.get(q.id) ?? '(메모 없음)'}
            </pre>
          </details>
        ))}

        <div className="notice" style={{ marginTop: 20 }}>
          <b>검수 SOP</b> — ① 자격요건 재확인 ② 미확인 수치 전수 확인 ③ 공고 평가지표와 목차 정합성
          ④ 분량·서식 규정 ⑤ 중복지원 제한 저촉 여부 ⑥ 과장 표현 제거 ⑦ 제출 서류 체크리스트 작성.
          모든 수정은 (원문 / 수정문 / 사유 / 대응 루브릭 항목) 4쌍으로 기록해 학습 자산으로 축적합니다.
        </div>
      </div>
    </>
  );
}
