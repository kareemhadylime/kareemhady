import { requireDomainAccess, type SessionUser } from '@/lib/auth';

/**
 * Server-action gate for any FM+ Budget read.
 * Redirects unauthenticated users to /login. 404s users without fmplus access.
 */
export async function requireBudgetView(): Promise<SessionUser> {
  return await requireDomainAccess('fmplus');
}

/**
 * Server-action gate for any FM+ Budget mutation (Edit/Import/Publish/Catalog/Settings).
 * First gates on fmplus access via requireBudgetView, then checks admin flag.
 */
export async function requireBudgetAdmin(): Promise<SessionUser> {
  const user = await requireDomainAccess('fmplus');
  if (!user.is_admin) {
    throw new Error('forbidden_admin_required');
  }
  return user;
}
