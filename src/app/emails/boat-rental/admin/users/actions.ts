'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { requireBoatAdmin, s, sOrNull } from '@/lib/boat-rental/server-helpers';

// Username is stored lowercase throughout the codebase (see existing
// /admin/users create flow). Passwords are set by admin directly; users
// change theirs at /account/password after first login.

// Normalize a WhatsApp number to Green-API's E.164-without-plus shape
// (digits only, 8–15 chars). Strips spaces, dashes, and leading '+'.
// Returns null for blank input; returns the string 'invalid' for input
// that has digits but doesn't meet the length range so the caller can
// distinguish "leave unchanged" from "user typed garbage".
function normalizeWhatsapp(raw: string): string | null | 'invalid' {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return 'invalid';
  return digits;
}

async function upsertUserWithRole(args: {
  username: string;
  password: string;
  whatsapp: string | null;
  role: 'broker' | 'owner';
  ownerId: string | null;
}): Promise<{ userId: string; created: boolean } | { error: string }> {
  const sb = supabaseAdmin();

  // Look up existing user with this username.
  const { data: existing } = await sb
    .from('app_users')
    .select('id')
    .eq('username', args.username)
    .maybeSingle();

  let userId: string;
  let created = false;
  if (existing) {
    userId = (existing as { id: string }).id;
    // If admin re-invited an existing username and provided a whatsapp,
    // update it. Don't wipe an existing whatsapp by passing null.
    if (args.whatsapp) {
      await sb.from('app_users').update({ whatsapp: args.whatsapp }).eq('id', userId);
    }
  } else {
    if (args.password.length < 8) return { error: 'password_too_short' };
    const { data, error } = await sb
      .from('app_users')
      .insert({
        username: args.username,
        password_hash: hashPassword(args.password),
        role: 'viewer', // app-level role stays at viewer; sub-role is in boat_rental_user_roles
        whatsapp: args.whatsapp,
      })
      .select('id')
      .single();
    if (error || !data) return { error: error?.message || 'create_failed' };
    userId = (data as { id: string }).id;
    created = true;
  }

  // Ensure boat-rental domain access (required to reach the route tree).
  await sb
    .from('app_user_domain_roles')
    .upsert({ user_id: userId, domain: 'boat-rental', role: 'viewer' }, { onConflict: 'user_id,domain' });

  // Assign sub-role.
  await sb
    .from('boat_rental_user_roles')
    .upsert(
      { user_id: userId, role: args.role, owner_id: args.ownerId },
      { onConflict: 'user_id,role' }
    );

  return { userId, created };
}

export async function inviteBrokerAction(formData: FormData) {
  await requireBoatAdmin();
  const username = s(formData.get('username')).toLowerCase();
  const password = s(formData.get('password'));
  const wa = normalizeWhatsapp(s(formData.get('whatsapp')));
  if (wa === 'invalid') throw new Error('whatsapp_invalid');
  if (!username || password.length < 8) return;
  await upsertUserWithRole({ username, password, whatsapp: wa, role: 'broker', ownerId: null });
  revalidatePath('/emails/boat-rental/admin/users');
}

export async function inviteOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const username = s(formData.get('username')).toLowerCase();
  const password = s(formData.get('password'));
  const ownerId = sOrNull(formData.get('owner_id'));
  const wa = normalizeWhatsapp(s(formData.get('whatsapp')));
  if (wa === 'invalid') throw new Error('whatsapp_invalid');
  if (!username || password.length < 8 || !ownerId) return;
  const result = await upsertUserWithRole({ username, password, whatsapp: wa, role: 'owner', ownerId });
  if ('userId' in result) {
    // Link the owner record back to the user for convenience.
    const sb = supabaseAdmin();
    await sb
      .from('boat_rental_owners')
      .update({ user_id: result.userId, updated_at: new Date().toISOString() })
      .eq('id', ownerId);
  }
  revalidatePath('/emails/boat-rental/admin/users');
}

// Update just the WhatsApp number on an existing user. Empty input
// clears the column (so admins can fix typos by re-saving blank).
export async function updateUserWhatsappAction(formData: FormData) {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  const wa = normalizeWhatsapp(s(formData.get('whatsapp')));
  if (!userId) return;
  if (wa === 'invalid') throw new Error('whatsapp_invalid');
  const sb = supabaseAdmin();
  await sb.from('app_users').update({ whatsapp: wa }).eq('id', userId);
  revalidatePath('/emails/boat-rental/admin/users');
}

export async function resetPasswordAction(formData: FormData) {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  const newPw = s(formData.get('new_password'));
  if (!userId || newPw.length < 8) return;
  const sb = supabaseAdmin();
  await sb.from('app_users').update({ password_hash: hashPassword(newPw) }).eq('id', userId);
  // Also wipe existing sessions so the user is forced to re-auth with the new password.
  await sb.from('app_sessions').delete().eq('user_id', userId);
  revalidatePath('/emails/boat-rental/admin/users');
}

// Upload (or replace) a broker's logo. Stored in the existing
// 'boat-rental' bucket under 'user-logos/{user_id}/{uuid}.{ext}'. We
// don't process the image — the PDF print page renders it with
// object-contain inside a fixed slot, so any aspect ratio fits.
export async function uploadUserLogoAction(formData: FormData) {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  if (!userId) return;

  const file = formData.get('logo');
  const f = file instanceof File && file.size > 0 ? file : null;
  if (!f) return;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(f.type)) throw new Error('logo_invalid_type');
  if (f.size > 2 * 1024 * 1024) throw new Error('logo_too_large');

  // Verify the target user is actually a broker — logos are broker-only.
  const sb = supabaseAdmin();
  const { data: roleRow } = await sb
    .from('boat_rental_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'broker')
    .maybeSingle();
  if (!roleRow) throw new Error('not_a_broker');

  const ext =
    f.type === 'image/png' ? 'png' :
    f.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `user-logos/${userId}/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await f.arrayBuffer());
  const up = await sb.storage.from('boat-rental').upload(key, buf, {
    contentType: f.type,
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);

  // Best-effort: remove the previous logo file so storage doesn't bloat.
  const { data: prior } = await sb
    .from('app_users')
    .select('logo_path')
    .eq('id', userId)
    .maybeSingle();
  const oldPath = (prior as { logo_path: string | null } | null)?.logo_path;
  if (oldPath && oldPath !== key) {
    await sb.storage.from('boat-rental').remove([oldPath]);
  }

  await sb.from('app_users').update({ logo_path: key }).eq('id', userId);
  revalidatePath('/emails/boat-rental/admin/users');
}

export async function removeUserLogoAction(formData: FormData) {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  if (!userId) return;
  const sb = supabaseAdmin();
  const { data: prior } = await sb
    .from('app_users')
    .select('logo_path')
    .eq('id', userId)
    .maybeSingle();
  const oldPath = (prior as { logo_path: string | null } | null)?.logo_path;
  if (oldPath) {
    await sb.storage.from('boat-rental').remove([oldPath]);
  }
  await sb.from('app_users').update({ logo_path: null }).eq('id', userId);
  revalidatePath('/emails/boat-rental/admin/users');
}

export async function removeBoatRoleAction(formData: FormData) {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  const role = s(formData.get('role'));
  if (!userId || !['admin', 'broker', 'owner'].includes(role)) return;
  const sb = supabaseAdmin();
  await sb
    .from('boat_rental_user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role);
  // If the user has no remaining boat_rental roles, also drop their
  // boat-rental domain access so they can't reach the tree.
  const { count } = await sb
    .from('boat_rental_user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if ((count || 0) === 0) {
    await sb
      .from('app_user_domain_roles')
      .delete()
      .eq('user_id', userId)
      .eq('domain', 'boat-rental');
  }
  revalidatePath('/emails/boat-rental/admin/users');
}
