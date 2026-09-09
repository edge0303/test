import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session) redirect('/');
  const { next } = await searchParams;
  // 열린 리다이렉트를 막기 위해 내부 경로만 허용한다.
  const safeNext = next && /^\/(?!\/)/.test(next) ? next : '/';
  return <LoginForm next={safeNext} />;
}
