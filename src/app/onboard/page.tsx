import TopBar from '@/components/TopBar';
import OnboardForm from '@/components/OnboardForm';
import { requireSession } from '@/lib/auth';
import { getCompanyForUser } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function OnboardPage() {
  const session = await requireSession();
  const company = getCompanyForUser(session.user.id);
  return (
    <>
      <TopBar company={company} session={session} />
      <OnboardForm />
    </>
  );
}
