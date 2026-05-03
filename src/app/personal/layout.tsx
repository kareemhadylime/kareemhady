import { redirect } from 'next/navigation';
import { TopNav } from '@/app/_components/brand';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessDomain(user, 'personal')) redirect('/');
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}
