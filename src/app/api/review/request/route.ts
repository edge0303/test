import { NextResponse } from 'next/server';
import { getApplicationOwned, getCompanyOwned, getProgram, requestExpertReview } from '@/lib/repo';
import { loadApplicationView } from '@/lib/pipeline';
import { guardApi, isFail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * 전문가 최종 검수 요청.
 * 요청 시점에 '검수 전 자동 사전정리' 를 함께 저장한다.
 * 검수자가 이 메모를 먼저 보면 검수 시간이 절반으로 줄기 때문이다. (기획서 16.1)
 */
export async function POST(req: Request) {
  const guard = await guardApi();
  if (isFail(guard)) return guard.response;

  const { applicationId } = (await req.json()) as { applicationId: number };
  const app = getApplicationOwned(Number(applicationId), guard.user.id);
  if (!app) return NextResponse.json({ ok: false, message: '찾을 수 없습니다.' }, { status: 404 });

  const company = getCompanyOwned(app.company_id, guard.user.id)!;
  const program = getProgram(app.program_id)!;
  const view = loadApplicationView(app.id, company, program);

  const failed = view.judge.criteria.flatMap((c) =>
    c.checks.filter((k) => !k.passed).map((k) => `- [${c.label}] ${k.label}`),
  );

  const memo = [
    `■ 자동 사전정리 (검수자용)`,
    ``,
    `공고: ${program.title} (${program.agency})`,
    `마감: ${program.apply_end_at ?? '-'}`,
    `기업: ${company.name} / ${company.industry_name ?? '-'} / ${company.region_sido ?? '-'}`,
    ``,
    `현재 점수: ${view.judge.total}/100 (통과 예상선 ${view.judge.passLine})`,
    `미확인 항목을 채우면 회복 가능한 점수: +${view.judge.recoverable}`,
    ``,
    `1) 사용자가 채워야 할 미확인 항목 (${view.report.unresolvedMarkers.length}건)`,
    ...view.report.unresolvedMarkers.slice(0, 30).map((m) => `- [${m.section}] ${m.label}`),
    ``,
    `2) 대조 불가 수치 (${view.report.unverifiedNumbers.length}건)`,
    ...view.report.unverifiedNumbers.slice(0, 20).map((n) => `- [${n.section}] ${n.snippet}`),
    ``,
    `3) 잔여 감점 항목 (${failed.length}건)`,
    ...(failed.length ? failed : ['- 없음']),
  ].join('\n');

  const due = new Date();
  let added = 0;
  while (added < 3) { // 3영업일
    due.setDate(due.getDate() + 1);
    const d = due.getDay();
    if (d !== 0 && d !== 6) added++;
  }

  const id = requestExpertReview(app.id, memo, due.toISOString().slice(0, 10));
  return NextResponse.json({ ok: true, reviewId: id, dueAt: due.toISOString().slice(0, 10) });
}
