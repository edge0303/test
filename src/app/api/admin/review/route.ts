import { NextResponse } from 'next/server';
import { updateExpertReview } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData();
  const id = Number(form.get('id'));
  const status = String(form.get('status') ?? '');
  const assignee = String(form.get('assignee') ?? '') || undefined;
  if (!id || !status) {
    return NextResponse.json({ ok: false, message: 'id와 status가 필요합니다.' }, { status: 400 });
  }
  updateExpertReview(id, { status, assignee });
  return NextResponse.redirect(new URL('/admin/reviews', req.url), 303);
}
