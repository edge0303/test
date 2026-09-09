import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCompanyForUser } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  const company = getCompanyForUser(session.user.id);
  redirect(company ? '/dashboard' : '/onboard');
}
