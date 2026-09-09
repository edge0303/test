import { NextResponse } from 'next/server';
import {
  getApplicationOwned, getCompanyOwned, getProgram, latestSections, saveSections, saveScore,
} from '@/lib/repo';
import { judgeDeterministic } from '@/lib/judge';
import { SECTION_META, buildFactSlots } from '@/lib/psst';
import { verify } from '@/lib/verifier';
import { guardApi, isFail } from '@/lib/auth';
import type { DraftSection, SectionKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_SECTION_CHARS = 20_000;

export async function POST(req: Request) {
  const guard = await guardApi();
  if (isFail(guard)) return guard.response;

  const { applicationId, sections } = (await req.json()) as {
    applicationId: number;
    sections: Record<SectionKey, string>;
  };
  const app = getApplicationOwned(Number(applicationId), guard.user.id);
  if (!app) return NextResponse.json({ ok: false, message: '찾을 수 없습니다.' }, { status: 404 });

  for (const [key, value] of Object.entries(sections ?? {})) {
    if (typeof value === 'string' && value.length > MAX_SECTION_CHARS) {
      return NextResponse.json(
        { ok: false, message: `섹션 하나는 ${MAX_SECTION_CHARS.toLocaleString()}자를 넘을 수 없습니다. (${key})` },
        { status: 413 },
      );
    }
  }

  const company = getCompanyOwned(app.company_id, guard.user.id)!;
  const program = getProgram(app.program_id)!;
  const current = latestSections(app.id);
  const version = Math.max(1, ...current.map((c) => c.version)) + 1;

  const next: DraftSection[] = SECTION_META.map((m) => ({
    key: m.key,
    title: m.title,
    content: sections?.[m.key] ?? current.find((c) => c.key === m.key)?.content ?? '',
  }));

  saveSections(app.id, next, version);
  const judge = judgeDeterministic(next);
  judge.engine = app.engine as 'deterministic' | 'deterministic+llm';
  saveScore(app.id, version, judge);

  const report = verify(next, buildFactSlots(company, program));
  return NextResponse.json({ ok: true, judge, report, version });
}
