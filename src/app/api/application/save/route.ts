import { NextResponse } from 'next/server';
import { getApplication, getCompany, getProgram, latestSections, saveSections, saveScore } from '@/lib/repo';
import { judgeDeterministic } from '@/lib/judge';
import { SECTION_META, buildFactSlots } from '@/lib/psst';
import { verify } from '@/lib/verifier';
import type { DraftSection, SectionKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** 사용자가 직접 고친 본문을 저장하고 즉시 재채점한다. 편집 효과를 바로 보여주기 위함이다. */
export async function POST(req: Request) {
  const { applicationId, sections } = (await req.json()) as {
    applicationId: number;
    sections: Record<SectionKey, string>;
  };
  const app = getApplication(applicationId);
  if (!app) return NextResponse.json({ ok: false, message: '지원서를 찾을 수 없습니다.' }, { status: 404 });

  const company = getCompany(app.company_id)!;
  const program = getProgram(app.program_id)!;
  const current = latestSections(applicationId);
  const version = Math.max(1, ...current.map((c) => c.version)) + 1;

  const next: DraftSection[] = SECTION_META.map((m) => ({
    key: m.key,
    title: m.title,
    content: sections[m.key] ?? current.find((c) => c.key === m.key)?.content ?? '',
  }));

  saveSections(applicationId, next, version);
  const judge = judgeDeterministic(next);
  judge.engine = app.engine as 'deterministic' | 'deterministic+llm';
  saveScore(applicationId, version, judge);

  const report = verify(next, buildFactSlots(company, program));
  return NextResponse.json({ ok: true, judge, report, version });
}
