'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { SESSION_COOKIE } from '@/lib/auth';
import { logAudit } from '@/lib/boat-rental/server-helpers';

// Set or clear admin impersonation. Admin-only.
//
// To start impersonation: pass target_user_id as a UUID.
// To stop impersonation: pass target_user_id as empty string.
//
// Auth model: getCurrentUser() returns the EFFECTIVE user (the impersonated
// one if currently impersonating). To allow an admin who's already
// impersonating to switch targets or revert, we read the session row directly
// and check whether the SESSION's underlying user is admin.
export async function setImpersonationAction(formData: FormData): Promise<void> {
  const targetUserId = String(formData.get('target_user_id') ?? '').trim();
  const redirectTo = String(formData.get('redirect_to') ?? '/').trim() || '/';

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('no_session');

  const sb = supabaseAdmin();
  const { data: session } = await sb
    .from('app_sessions')
    .select('user_id, expires_at, impersonating_user_id')
    .eq('token', token)
    .maybeSingle();
  if (!session) throw new Error('no_session');
  const sess = session as {
    user_id: string;
    expires_at: string;
    impersonating_user_id: string | null;
  };
  if (new Date(sess.expires_at).getTime() < Date.now()) throw new Error('session_expired');

  // The session's underlying user (the original real login) must be an admin.
  const { data: realUser } = await sb
    .from('app_users')
    .select('id, role, disabled_at')
    .eq('id', sess.user_id)
    .maybeSingle();
  if (!realUser) throw new Error('not_found');
  const realUserRow = realUser as { id: string; role: string; disabled_at: string | null };
  if (realUserRow.disabled_at) throw new Error('disabled');
  const isAdmin = (realUserRow.role || '').toLowerCase() === 'admin';
  if (!isAdmin) throw new Error('forbidden');

  // Empty string = clear impersonation
  if (!targetUserId) {
    if (sess.impersonating_user_id) {
      await sb
        .from('app_sessions')
        .update({ impersonating_user_id: null })
        .eq('token', token);
      await logAudit({
        actorUserId: realUserRow.id,
        actorRole: 'admin',
        action: 'admin_impersonation_end',
        payload: { previously_impersonating: sess.impersonating_user_id },
      });
    }
    revalidatePath('/');
    redirect(redirectTo);
  }

  // Validate target exists, is not disabled, and isn't the admin themselves
  if (targetUserId === realUserRow.id) {
    // Self-impersonation = same as clearing
    await sb
      .from('app_sessions')
      .update({ impersonating_user_id: null })
      .eq('token', token);
    revalidatePath('/');
    redirect(redirectTo);
  }
  const { data: target } = await sb
    .from('app_users')
    .select('id, username, disabled_at')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!target) throw new Error('target_not_found');
  const t = target as { id: string; username: string; disabled_at: string | null };
  if (t.disabled_at) throw new Error('target_disabled');

  await sb
    .from('app_sessions')
    .update({ impersonating_user_id: t.id })
    .eq('token', token);

  await logAudit({
    actorUserId: realUserRow.id,
    actorRole: 'admin',
    action: 'admin_impersonation_start',
    payload: { target_user_id: t.id, target_username: t.username },
  });

  revalidatePath('/');
  redirect(redirectTo);
}
