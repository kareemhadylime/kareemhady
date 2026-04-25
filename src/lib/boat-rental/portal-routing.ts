import 'server-only';
import type { SessionUser } from '../auth';
import { getBoatRoles, hasBoatRole, type BoatRole } from './auth';

// Multi-role portal switcher infrastructure.
//
// A user can hold any combination of admin / broker / owner. The
// switcher exposes whichever portals they actually hold; the cookie
// remembers the last visited so subsequent logins land them there.

export const LAST_PORTAL_COOKIE = 'boat_rental_last_portal';

export type PortalEntry = {
  key: BoatRole;
  label: 'Admin' | 'Broker' | 'Owner';
  href: string;
};

const PORTAL_ENTRIES: Record<BoatRole, PortalEntry> = {
  admin:  { key: 'admin',  label: 'Admin',  href: '/emails/boat-rental/admin' },
  broker: { key: 'broker', label: 'Broker', href: '/emails/boat-rental/broker' },
  owner:  { key: 'owner',  label: 'Owner',  href: '/emails/boat-rental/owner' },
};

// Returns the list of portals this user has access to, in display
// order (admin → broker → owner). Empty if user has no boat-rental
// role at all.
export async function getAvailableBoatPortals(user: SessionUser): Promise<PortalEntry[]> {
  const out: PortalEntry[] = [];
  if (await hasBoatRole(user, 'admin')) out.push(PORTAL_ENTRIES.admin);
  if (await hasBoatRole(user, 'broker')) out.push(PORTAL_ENTRIES.broker);
  if (await hasBoatRole(user, 'owner')) out.push(PORTAL_ENTRIES.owner);
  return out;
}

// Resolve a portal key to its href without going through the helper —
// used by the login redirect to honour the lastPortal cookie.
export function portalHrefFor(key: BoatRole): string {
  return PORTAL_ENTRIES[key].href;
}

// Used by the login route. If the user has visited a boat-rental
// portal before AND still has that role, return that portal's href.
// Otherwise null — caller falls back to its default landing.
export async function pickLandingFromCookie(
  user: SessionUser,
  cookieValue: string | undefined
): Promise<string | null> {
  if (!cookieValue) return null;
  if (cookieValue !== 'admin' && cookieValue !== 'broker' && cookieValue !== 'owner') {
    return null;
  }
  const role = cookieValue as BoatRole;
  if (!(await hasBoatRole(user, role))) return null;
  return portalHrefFor(role);
}

// Used by the owner layout's "acting as" banner. Returns the owner
// record name when the viewer's owner role points at exactly one
// owner record. Null for owner-only users (banner is suppressed) or
// users with no owner role.
export async function getActingAsOwnerName(user: SessionUser): Promise<string | null> {
  // No banner if owner is the user's only role — they aren't acting,
  // they ARE the owner.
  const isAdmin = await hasBoatRole(user, 'admin');
  const isBroker = await hasBoatRole(user, 'broker');
  if (!isAdmin && !isBroker) return null;

  const roles = await getBoatRoles(user);
  const ownerRole = roles.find(r => r.role === 'owner' && r.owner_id);
  if (!ownerRole?.owner_id) return null;

  const { supabaseAdmin } = await import('../supabase');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_owners')
    .select('name')
    .eq('id', ownerRole.owner_id)
    .maybeSingle();
  return (data as { name: string } | null)?.name || null;
}
