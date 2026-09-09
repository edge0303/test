import { getApplicationOwned, getCompanyOwned, getProgram } from '@/lib/repo';
import { getSession } from '@/lib/auth';
import { loadApplicationView } from '@/lib/pipeline';
import { formatKRW } from '@/lib/profile';
import { formatBizNo } from '@/lib/bizno';

export const dynamic = 'force-dynamic';

/** 지원서를 마크다운으로 내보낸다. 사용자가 공고 지정 양식에 붙여넣는 것을 전제로 한다. */
export async function GET(req: Request) {
  // 읽기 전용이라 CSRF 검사는 하지 않지만, 인증과 소유권은 반드시 확인한다.
  const session = await getSession();
  if (!session) return new Response('로그인이 필요합니다.', { status: 401 });

  const url = new URL(req.url);
  const applicationId = Number(url.searchParams.get('applicationId'));
  const app = getApplicationOwned(applicationId, session.user.id);
  if (!app) return new Response('찾을 수 없습니다.', { status: 404 });

  const company = getCompanyOwned(app.company_id, session.user.id)!;
  const program = getProgram(app.program_id)!;
  const view = loadApplicationView(app.id, company, program);

  const md = [
    `# ${program.title} — 사업계획서 초안`,
    ``,
    `| 항목 | 내용 |`,
    `| --- | --- |`,
    `| 주관기관 | ${program.agency} |`,
    `| 접수기간 | ${program.apply_start_at ?? '-'} ~ ${program.apply_end_at ?? '-'} |`,
    `| 지원한도 | ${formatKRW(program.support_amount_max)} |`,
    `| 신청기업 | ${company.name} (${formatBizNo(company.biz_no)}) |`,
    `| 소재지 | ${[company.region_sido, company.region_sigungu].filter(Boolean).join(' ') || '-'} |`,
    `| 업종 | ${company.industry_name ?? '-'} |`,
    ``,
    `> ⚠ 이 문서는 자동 생성된 **초안**입니다. \`[확인 필요: ...]\` 표시가 남은 항목은`,
    `> 제출 전 반드시 실제 값으로 채우거나 해당 문장을 삭제하십시오.`,
    `> 최종 작성 및 제출 책임은 신청 기업에 있습니다.`,
    ``,
    `---`,
    ``,
    ...view.sections.flatMap((s) => [`## ${s.title}`, ``, s.content, ``]),
    `---`,
    ``,
    `## 심사위원 관점 자동 채점`,
    ``,
    `총점: **${view.judge.total} / 100** (통과 예상선 ${view.judge.passLine})`,
    `미확인 항목을 모두 채우면 회복 가능한 점수: **+${view.judge.recoverable}**`,
    ``,
    `| 평가항목 | 점수 | 미확인 감점 |`,
    `| --- | --- | --- |`,
    ...view.judge.criteria.map((c) => `| ${c.label} | ${c.score} / ${c.max} | -${c.penalty} |`),
    ``,
    `### 제출 전 확인 항목 (${view.report.unresolvedMarkers.length}건)`,
    ...(view.report.unresolvedMarkers.length
      ? view.report.unresolvedMarkers.map((m) => `- ${m.label}`)
      : ['- 없음']),
    ``,
    `### 대조 불가 수치 (${view.report.unverifiedNumbers.length}건)`,
    ...(view.report.unverifiedNumbers.length
      ? view.report.unverifiedNumbers.map((n) => `- ${n.snippet}`)
      : ['- 없음']),
    ``,
    ...(view.judge.narrative ? [`### 심사위원 총평`, ``, view.judge.narrative, ``] : []),
  ].join('\n');

  const filename = `application-${applicationId}.md`;
  return new Response(md, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
