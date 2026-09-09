import { NextResponse } from 'next/server';
import { getCompanyOwned, getProgram } from '@/lib/repo';
import { generateApplication } from '@/lib/pipeline';
import { guardApi, isFail } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const guard = await guardApi();
  if (isFail(guard)) return guard.response;

  const { companyId, programId, force } = (await req.json()) as {
    companyId: number; programId: number; force?: boolean;
  };
  const company = getCompanyOwned(Number(companyId), guard.user.id);
  const program = getProgram(Number(programId));
  if (!company || !program) {
    return NextResponse.json({ ok: false, message: '찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const result = await generateApplication(company, program, { force: Boolean(force) });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 예외 원문은 서버에만 남긴다. 경로·모듈명이 클라이언트로 새지 않도록.
    console.error('[generate]', err);
    return NextResponse.json({ ok: false, message: '지원서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
}
