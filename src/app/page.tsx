import { redirect } from 'next/navigation';
import { listCompanies } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default function Home() {
  const companies = listCompanies();
  if (companies.length === 0) redirect('/onboard');
  redirect(`/dashboard?c=${companies[0].id}`);
}
