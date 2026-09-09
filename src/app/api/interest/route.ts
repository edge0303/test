import { NextResponse } from 'next/server';
import { toggleInterest } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { companyId, programId } = (await req.json()) as { companyId: number; programId: number };
  if (!companyId || !programId) {
    return NextResponse.json({ ok: false, message: 'companyId와 programId가 필요합니다.' }, { status: 400 });
  }
  const on = toggleInterest(companyId, programId);
  return NextResponse.json({ ok: true, interested: on });
}
