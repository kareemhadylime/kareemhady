import { notFound } from 'next/navigation';
import {
  hasBeithadyPermission,
  type BeithadyCategory,
  type Permission,
} from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';

// Server component wrapper that hides children behind a Beithady
// permission check. Use it inline within larger pages where only some
// sections are gated (vs. requireBeithadyPermission() which 404s the
// whole page).

export async function RequireBeithadyPermission({
  category,
  required = 'read',
  fallback = null,
  children,
}: {
  category: BeithadyCategory;
  required?: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const ok = await hasBeithadyPermission(user, category, required);
  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}

// Page-level guard for routes where the whole page is gated.
export async function PageGuard({ category, required = 'read' }: {
  category: BeithadyCategory;
  required?: Permission;
}) {
  const user = await getCurrentUser();
  const ok = await hasBeithadyPermission(user, category, required);
  if (!ok) notFound();
  return null;
}
