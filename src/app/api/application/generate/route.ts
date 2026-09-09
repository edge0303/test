import { NextResponse } from 'next/server';
import { getCompany, getProgram } from '@/lib/repo';
import { generateApplication } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const { companyId, programId, force } = (await req.json()) as {
    companyId: number; programId: number; force?: boolean;
  };
  const company = getCompany(companyId);
  const program = getProgram(programId);
  if (!company || !program) {
    return NextResponse.json({ ok: false, message: '기업 또는 공고를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const result = await generateApplication(company, program, { force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[generate]', err);
    return NextResponse.json({ ok: false, message: `지원서 생성 실패: ${(err as Error).message}` }, { status: 500 });
  }
}
