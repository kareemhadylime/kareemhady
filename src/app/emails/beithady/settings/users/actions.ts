'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission, BEITHADY_ROLES, type BeithadyRole } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';

async function requireRoleManager() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'settings', 'full'));
  if (!allowed) throw new Error('forbidden');
  return user;
}

function parseRole(v: FormDataEntryValue | null): BeithadyRole {
  const s = String(v || '').trim();
  if (!(BEITHADY_ROLES as readonly string[]).includes(s)) {
    throw new Error(`invalid_role:${s}`);
  }
  return s as BeithadyRole;
}

export async function assignRoleAction(formData: FormData): Promise<void> {
  const actor = await requireRoleManager();
  const userId = String(formData.get('user_id') || '').trim();
  if (!userId) throw new Error('missing_user_id');
  const role = parseRole(formData.get('role'));

  const sb = supabaseAdmin();
  await sb.from('beithady_user_roles').upsert(
    {
      user_id: userId,
      role,
      granted_at: new Date().toISOString(),
      granted_by: actor.id,
    },
    { onConflict: 'user_id,role' }
  );
  await recordAudit({
    actor_user_id: actor.id,
    module: 'settings',
    action: 'role_granted',
    target_type: 'user',
    target_id: userId,
    after: { role },
  });
  revalidatePath('/emails/beithady/settings/users');
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const actor = await requireRoleManager();
  const userId = String(formData.get('user_id') || '').trim();
  if (!userId) throw new Error('missing_user_id');
  const role = parseRole(formData.get('role'));

  // Don't let an admin revoke their own last admin role and lock everyone out.
  if (userId === actor.id && role === 'admin') {
    const sb = supabaseAdmin();
    const { count } = await sb
      .from('beithady_user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((count || 0) <= 1) {
      throw new Error('cannot_revoke_last_admin');
    }
  }

  const sb = supabaseAdmin();
  await sb
    .from('beithady_user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role);
  await recordAudit({
    actor_user_id: actor.id,
    module: 'settings',
    action: 'role_revoked',
    target_type: 'user',
    target_id: userId,
    before: { role },
  });
  revalidatePath('/emails/beithady/settings/users');
}
