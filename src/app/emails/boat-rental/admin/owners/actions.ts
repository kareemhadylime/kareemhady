'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { requireBoatAdmin, s, sOrNull, normPhone } from '@/lib/boat-rental/server-helpers';

// Shared helper — provisions an app_users row + boat-rental domain
// access + owner sub-role linked back to the owner record. Mirrors the
// logic in /admin/users/actions.ts (kept inline here to avoid pulling
// the whole users-actions module into this surface). Username is
// always lowercased.
async function provisionOwnerLogin(args: {
  ownerId: string;
  username: string;
  password: string;
}): Promise<{ userId: string; created: boolean } | { error: string }> {
  if (args.username.length < 3) return { error: 'username_too_short' };
  if (args.password.length < 8) return { error: 'password_too_short' };

  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from('app_users')
    .select('id')
    .eq('username', args.username)
    .maybeSingle();

  let userId: string;
  let created = false;
  if (existing) {
    // Reusing an existing username for this owner — keep their
    // password as-is unless admin explicitly asked for a reset via
    // the dedicated action below.
    userId = (existing as { id: string }).id;
  } else {
    const { data, error } = await sb
      .from('app_users')
      .insert({
        username: args.username,
        password_hash: hashPassword(args.password),
        role: 'viewer', // app-level role; sub-role lives in boat_rental_user_roles
      })
      .select('id')
      .single();
    if (error || !data) return { error: error?.message || 'create_failed' };
    userId = (data as { id: string }).id;
    created = true;
  }

  await sb
    .from('app_user_domain_roles')
    .upsert(
      { user_id: userId, domain: 'boat-rental', role: 'viewer' },
      { onConflict: 'user_id,domain' }
    );

  await sb
    .from('boat_rental_user_roles')
    .upsert(
      { user_id: userId, role: 'owner', owner_id: args.ownerId },
      { onConflict: 'user_id,role' }
    );

  // Link the owner record back to the app_users row.
  await sb
    .from('boat_rental_owners')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('id', args.ownerId);

  return { userId, created };
}

export async function createOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const name = s(formData.get('name'));
  const whatsapp = normPhone(s(formData.get('whatsapp')));
  const email = sOrNull(formData.get('email'));
  const notes = sOrNull(formData.get('notes'));
  const loginUsername = s(formData.get('login_username')).toLowerCase();
  const loginPassword = s(formData.get('login_password'));
  if (!name || whatsapp.length < 9) return;

  const sb = supabaseAdmin();
  const { data: created, error } = await sb
    .from('boat_rental_owners')
    .insert({ name, whatsapp, email, notes })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message || 'create_failed');
  const ownerId = (created as { id: string }).id;

  // Optional inline login provisioning. Both fields must be present;
  // empty inputs just skip this step.
  if (loginUsername && loginPassword) {
    const result = await provisionOwnerLogin({
      ownerId,
      username: loginUsername,
      password: loginPassword,
    });
    if ('error' in result) throw new Error(result.error);
  }

  revalidatePath('/emails/boat-rental/admin/owners');
}

export async function updateOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  const whatsapp = normPhone(s(formData.get('whatsapp')));
  const email = sOrNull(formData.get('email'));
  const notes = sOrNull(formData.get('notes'));
  const status = s(formData.get('status'));
  if (!id || !name || whatsapp.length < 9) return;
  if (!['active', 'inactive'].includes(status)) return;
  const sb = supabaseAdmin();
  await sb
    .from('boat_rental_owners')
    .update({ name, whatsapp, email, notes, status, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/emails/boat-rental/admin/owners');
}

// Set up a login for an existing owner that doesn't have one yet.
// Username + password both required; username must be at least 3
// chars and password at least 8.
export async function setupOwnerLoginAction(formData: FormData) {
  await requireBoatAdmin();
  const ownerId = s(formData.get('owner_id'));
  const username = s(formData.get('username')).toLowerCase();
  const password = s(formData.get('password'));
  if (!ownerId || !username || !password) return;
  const result = await provisionOwnerLogin({ ownerId, username, password });
  if ('error' in result) throw new Error(result.error);
  revalidatePath('/emails/boat-rental/admin/owners');
}

// Reset the password for an existing owner login. Wipes any active
// sessions so the owner is forced to re-auth with the new credential.
export async function resetOwnerLoginPasswordAction(formData: FormData) {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  const newPw = s(formData.get('new_password'));
  if (!userId || newPw.length < 8) return;
  const sb = supabaseAdmin();
  await sb.from('app_users').update({ password_hash: hashPassword(newPw) }).eq('id', userId);
  await sb.from('app_sessions').delete().eq('user_id', userId);
  revalidatePath('/emails/boat-rental/admin/owners');
}

export async function deleteOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  // Reject delete if any boat still references this owner.
  const { count } = await sb
    .from('boat_rental_boats')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', id);
  if ((count || 0) > 0) {
    // Soft-archive instead of hard delete.
    await sb
      .from('boat_rental_owners')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id);
  } else {
    await sb.from('boat_rental_owners').delete().eq('id', id);
  }
  revalidatePath('/emails/boat-rental/admin/owners');
}
