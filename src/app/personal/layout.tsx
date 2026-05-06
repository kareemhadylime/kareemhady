import { redirect } from 'next/navigation';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';

// Thin auth gate. Each Personal page renders its own TopNav (with the
// right breadcrumb trail) via PersonalShell — matches the Beithady
// pattern and avoids the double-header bug.
export const dynamic = 'force-dynamic';

export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessDomain(user, 'personal')) redirect('/');
  return <>{children}</>;
}
