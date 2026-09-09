import { NextResponse } from 'next/server';
import { destroySession, getSession, assertCsrf } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  // 로그아웃도 상태 변경이므로 CSRF를 확인한다. 남이 강제로 로그아웃시킬 수 없어야 한다.
  if (session && !(await assertCsrf(session))) {
    return NextResponse.json({ ok: false, message: '요청 출처를 확인할 수 없습니다.' }, { status: 403 });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
