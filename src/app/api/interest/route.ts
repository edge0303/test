import { NextResponse } from 'next/server';
import { toggleInterest, getCompanyOwned } from '@/lib/repo';
import { guardApi, isFail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const guard = await guardApi();
  if (isFail(guard)) return guard.response;

  const { companyId, programId } = (await req.json()) as { companyId: number; programId: number };
  if (!companyId || !programId) {
    return NextResponse.json({ ok: false, message: 'companyId와 programId가 필요합니다.' }, { status: 400 });
  }
  if (!getCompanyOwned(Number(companyId), guard.user.id)) {
    return NextResponse.json({ ok: false, message: '찾을 수 없습니다.' }, { status: 404 });
  }

  const on = toggleInterest(Number(companyId), Number(programId));
  return NextResponse.json({ ok: true, interested: on });
}
