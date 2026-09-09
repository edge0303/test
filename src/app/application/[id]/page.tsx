import Link from 'next/link';
import { notFound } from 'next/navigation';
import TopBar from '@/components/TopBar';
import ApplicationWorkspace from '@/components/ApplicationWorkspace';
import { DdayBadge, FundTypeBadge } from '@/components/ui';
import { getApplicationOwned, getCompanyOwned, getProgram, getExpertReview } from '@/lib/repo';
import { requireSession } from '@/lib/auth';
import { loadApplicationView } from '@/lib/pipeline';
import { SECTION_META } from '@/lib/psst';
import { ddayOf } from '@/lib/matcher';
import { formatKRW } from '@/lib/profile';
import type { SectionKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  // 남의 지원서는 403이 아니라 404로 응답한다 — 존재 여부까지 숨기기 위함이다.
  const app = getApplicationOwned(Number(id), session.user.id);
  if (!app) notFound();

  const company = getCompanyOwned(app.company_id, session.user.id);
  const program = getProgram(app.program_id);
  if (!company || !program) notFound();

  const view = loadApplicationView(app.id, company, program);
  const review = getExpertReview(app.id);

  const sections = Object.fromEntries(view.sections.map((s) => [s.key, s.content])) as Record<SectionKey, string>;

  return (
    <>
      <TopBar company={company} session={session} />
      <div className="wrap">
        <div style={{ margin: '18px 0 6px' }}>
          <Link href="/dashboard" style={{ fontSize: 12.5 }}>← 대시보드로</Link>
        </div>

        <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <FundTypeBadge t={program.fund_type} />
            <DdayBadge d={ddayOf(program.apply_end_at)} />
            <span className="badge plain">
              {view.judge.engine === 'deterministic' ? '템플릿 모드' : 'AI 작성 모드'}
            </span>
            <span className="badge plain">재작성 {app.iteration_count}회</span>
          </div>
          <h1 style={{ margin: '2px 0 6px', fontSize: 19, letterSpacing: '-.02em' }}>{program.title}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            {program.agency} · 최대 {formatKRW(program.support_amount_max)} ·
            접수 {program.apply_start_at ?? '-'} ~ {program.apply_end_at ?? '-'}
            {program.url && <> · <a href={program.url} target="_blank" rel="noreferrer">공고 원문 ↗</a></>}
          </div>
        </div>

        <ApplicationWorkspace
          applicationId={app.id}
          companyId={company.id}
          programId={program.id}
          sectionMeta={SECTION_META}
          initialSections={sections}
          initialJudge={view.judge}
          initialReport={view.report}
          history={view.history.map((h) => ({ iteration: h.iteration, total: h.total }))}
          reviewStatus={review?.status ?? null}
          reviewDue={review?.due_at ?? null}
        />
      </div>
    </>
  );
}
