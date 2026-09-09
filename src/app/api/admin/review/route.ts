import { NextResponse } from 'next/server';
import { updateExpertReview } from '@/lib/repo';
import { guardApi, isFail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['queued', 'in_progress', 'done']);

export async function POST(req: Request) {
  const form = await req.formData();

  // 폼 전송에는 커스텀 헤더를 실을 수 없으므로 hidden 필드로 CSRF 토큰을 받는다.
  const guard = await guardApi({ admin: true, csrfToken: String(form.get('csrf') ?? '') });
  if (isFail(guard)) return guard.response;

  const id = Number(form.get('id'));
  const status = String(form.get('status') ?? '');
  const assignee = String(form.get('assignee') ?? '').slice(0, 40) || undefined;
  if (!id || !ALLOWED.has(status)) {
    return NextResponse.json({ ok: false, message: 'id와 status가 필요합니다.' }, { status: 400 });
  }
  updateExpertReview(id, { status, assignee });

  // req.url(=Host 헤더)을 신뢰하지 않고 경로만으로 리다이렉트한다.
  return new NextResponse(null, { status: 303, headers: { location: '/admin/reviews' } });
}
