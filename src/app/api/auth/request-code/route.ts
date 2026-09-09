import { NextResponse } from 'next/server';
import { requestLoginCode, assertSameOrigin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MSG: Record<string, string> = {
  invalid_email: '이메일 주소를 다시 확인해 주세요.',
  cooldown: '방금 인증번호를 보냈습니다. 1분 뒤에 다시 시도해 주세요.',
  rate_limited: '요청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.',
};

export async function POST(req: Request) {
  if (!(await assertSameOrigin())) {
    return NextResponse.json({ ok: false, message: '요청 출처를 확인할 수 없습니다.' }, { status: 403 });
  }
  const { email } = (await req.json()) as { email?: string };
  const result = await requestLoginCode(email ?? '');

  if (!result.ok && result.reason !== 'invalid_email') {
    return NextResponse.json({ ok: false, message: MSG[result.reason] }, { status: 429 });
  }
  // 가입 여부를 알려주지 않는다. 존재하지 않는 이메일이어도 같은 응답을 준다.
  // 인증번호는 절대 응답에 싣지 않는다.
  return NextResponse.json({
    ok: true,
    message: '인증번호를 보냈습니다. 메일함을 확인해 주세요. (10분간 유효)',
  });
}
