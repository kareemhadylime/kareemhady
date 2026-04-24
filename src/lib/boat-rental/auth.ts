import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, type SessionUser } from '../auth';
import { supabaseAdmin } from '../supabase';

// Role gate for the boat-rental module. Sits on top of the standard
// requireDomainAccess('boat-rental') — that grants access to the
// /emails/boat-rental tree; these helpers control the admin/broker/owner
// sub-routes within it.

export type BoatRole = 'admin' | 'broker' | 'owner';

type BoatRoleRow = { role: BoatRole; owner_id: string | null };

// Per-request cache: getCurrentUser → boat roles. Avoids 3 Supabase
// round-trips inside a single layout + page render.
const cache = new WeakMap<SessionUser, BoatRoleRow[]>();

export async function getBoatRoles(user: SessionUser): Promise<BoatRoleRow[]> {
  const cached = cache.get(user);
  if (cached) return cached;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_user_roles')
    .select('role, owner_id')
    .eq('user_id', user.id);
  const rows = (data as BoatRoleRow[] | null) || [];
  cache.set(user, rows);
  return rows;
}

export async function hasBoatRole(user: SessionUser | null, role: BoatRole): Promise<boolean> {
  if (!user) return false;
  // App-level admin ⇒ implicit admin for this module too (matches existing pattern).
  if (user.is_admin && role === 'admin') return true;
  const roles = await getBoatRoles(user);
  return roles.some(r => r.role === role);
}

// Layout-level gate for the admin/broker/owner sub-trees. Redirects to
// login if no session, 404s if session exists but role is missing.
export async function requireBoatRole(role: BoatRole, nextPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!(await hasBoatRole(user, role))) notFound();
  return user;
}

// Returns the owner_id rows for a user with role='owner'. A single person
// may be set as owner of multiple physical owner records (rare, but data
// model allows it).
export async function getOwnedOwnerIds(user: SessionUser): Promise<string[]> {
  const roles = await getBoatRoles(user);
  return roles.filter(r => r.role === 'owner' && r.owner_id).map(r => r.owner_id as string);
}

// Decides where to send a user after login when they have only
// boat-rental roles. Used by the /login post-auth redirect to full-gate
// broker/owner users into their portal instead of the generic landing.
//   - admin              → /emails/boat-rental/admin
//   - broker only        → /emails/boat-rental/broker
//   - owner only         → /emails/boat-rental/owner
//   - mixed/other domains → null (caller falls back to existing landing)
export async function computeBoatRentalLanding(user: SessionUser): Promise<string | null> {
  const hasOtherDomain = user.allowed_domains.some(d => d !== 'boat-rental');
  if (user.is_admin || hasOtherDomain) return null;
  const roles = await getBoatRoles(user);
  if (roles.length === 0) return null;
  if (roles.some(r => r.role === 'admin')) return '/emails/boat-rental/admin';
  if (roles.some(r => r.role === 'broker')) return '/emails/boat-rental/broker';
  if (roles.some(r => r.role === 'owner')) return '/emails/boat-rental/owner';
  return null;
}
