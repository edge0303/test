import { NextResponse } from 'next/server';
import { verifyLoginCode, assertSameOrigin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MSG: Record<string, string> = {
  invalid_email: '이메일 주소를 다시 확인해 주세요.',
  no_code: '유효한 인증번호가 없습니다. 다시 요청해 주세요.',
  expired: '인증번호가 만료되었습니다. 다시 요청해 주세요.',
  too_many: '입력 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.',
  mismatch: '인증번호가 올바르지 않습니다.',
};

export async function POST(req: Request) {
  if (!(await assertSameOrigin())) {
    return NextResponse.json({ ok: false, message: '요청 출처를 확인할 수 없습니다.' }, { status: 403 });
  }
  const { email, code } = (await req.json()) as { email?: string; code?: string };
  const result = await verifyLoginCode(email ?? '', code ?? '');
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: MSG[result.reason] }, { status: 401 });
  }
  return NextResponse.json({ ok: true, email: result.user.email, role: result.user.role });
}
