import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser, type SessionUser } from '@/lib/auth';

// Beithady fine-grained roles (Plan v0.3 Q-B). Beithady is a single
// tenant under the holding company; this is a second permission layer
// *inside* the existing requireDomainAccess('beithady') gate. App-level
// admins (app_users.role='admin') bypass these checks entirely.

export const BEITHADY_ROLES = [
  'guest_relations',
  'finance',
  'ops',
  'manager',
  'admin',
] as const;
export type BeithadyRole = (typeof BEITHADY_ROLES)[number];

export type BeithadyCategory =
  | 'financial'
  | 'analytics'
  | 'crm'
  | 'communication'
  | 'settings'
  | 'gallery'
  | 'ads';

export type Permission = 'none' | 'read' | 'full';

// Permission matrix from Plan v0.3 §C.5 — role × category → access level.
const PERMISSIONS: Record<BeithadyRole, Record<BeithadyCategory, Permission>> = {
  guest_relations: {
    financial: 'none',
    analytics: 'read',
    crm: 'full',
    communication: 'full',
    settings: 'read',          // own profile only — handled at sub-tab level
    gallery: 'full',
    ads: 'none',
  },
  finance: {
    financial: 'full',
    analytics: 'read',
    crm: 'read',
    communication: 'none',
    settings: 'read',
    gallery: 'read',
    ads: 'none',
  },
  ops: {
    financial: 'read',
    analytics: 'full',
    crm: 'full',
    communication: 'full',
    settings: 'read',
    gallery: 'full',
    ads: 'none',
  },
  manager: {
    financial: 'full',
    analytics: 'full',
    crm: 'full',
    communication: 'full',
    settings: 'read',          // partial — no integration credentials, enforced in sub-tab
    gallery: 'full',
    ads: 'full',
  },
  admin: {
    financial: 'full',
    analytics: 'full',
    crm: 'full',
    communication: 'full',
    settings: 'full',
    gallery: 'full',
    ads: 'full',
  },
};

// Sub-tabs of /emails/beithady/settings that are restricted to admins
// even within the manager role's general 'settings: read' permission.
export const ADMIN_ONLY_SETTINGS_SUBTABS = new Set([
  'integrations',  // credentials are admin-only
]);

// ---- DB queries ----

export async function getBeithadyRoles(userId: string): Promise<BeithadyRole[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_user_roles')
    .select('role')
    .eq('user_id', userId);
  return ((data as Array<{ role: BeithadyRole }> | null) || []).map(r => r.role);
}

// Effective roles considering app-level admin elevation. App admins
// behave as if they have every Beithady role.
export async function getEffectiveBeithadyRoles(user: SessionUser): Promise<BeithadyRole[]> {
  if (user.is_admin) return [...BEITHADY_ROLES];
  return getBeithadyRoles(user.id);
}

// ---- Permission helpers ----

export function rolesGrantPermission(
  roles: BeithadyRole[],
  category: BeithadyCategory,
  required: Permission
): boolean {
  if (required === 'none') return true;
  // Find the strongest grant across the user's roles for this category.
  const granted = roles.reduce<Permission>((best, r) => {
    const lvl = PERMISSIONS[r][category];
    if (best === 'full') return best;
    if (lvl === 'full') return 'full';
    if (lvl === 'read') return 'read';
    return best;
  }, 'none');
  if (required === 'read') return granted === 'read' || granted === 'full';
  return granted === 'full';
}

export async function hasBeithadyPermission(
  user: SessionUser | null,
  category: BeithadyCategory,
  required: Permission = 'read'
): Promise<boolean> {
  if (!user) return false;
  if (user.is_admin) return true;
  const roles = await getBeithadyRoles(user.id);
  return rolesGrantPermission(roles, category, required);
}

// Layout / page guard — call from server components. Throws notFound()
// for non-permitted users (proxy already gates login). Returns the
// user + their effective roles so the page can render conditional UI.
export async function requireBeithadyPermission(
  category: BeithadyCategory,
  required: Permission = 'read'
): Promise<{ user: SessionUser; roles: BeithadyRole[] }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/emails/beithady`);
  const roles = await getEffectiveBeithadyRoles(user);
  if (!rolesGrantPermission(roles, category, required)) notFound();
  return { user, roles };
}

// Categories the user can see at all (read or full). Used by the
// 5-card landing to hide cards a user has no access to.
export function visibleCategoriesFor(roles: BeithadyRole[]): BeithadyCategory[] {
  const all: BeithadyCategory[] = [
    'financial',
    'analytics',
    'crm',
    'communication',
    'settings',
    'gallery',
    'ads',
  ];
  return all.filter(c => rolesGrantPermission(roles, c, 'read'));
}

export function canAccessSettingsSubtab(
  roles: BeithadyRole[],
  subtab: string,
  isAppAdmin: boolean
): boolean {
  if (isAppAdmin) return true;
  if (ADMIN_ONLY_SETTINGS_SUBTABS.has(subtab)) {
    return roles.includes('admin');
  }
  // Any role with at least 'read' on settings can see non-restricted sub-tabs.
  return rolesGrantPermission(roles, 'settings', 'read');
}
