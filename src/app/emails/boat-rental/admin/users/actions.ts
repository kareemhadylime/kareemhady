'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { requireBoatAdmin, s, sOrNull, logAudit } from '@/lib/boat-rental/server-helpers';
import { enqueueNotification, flushPendingNonReservation } from '@/lib/boat-rental/notifications';
import { randomFriendlyPassword } from '@/lib/random-password';

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

// Send the welcome WhatsApp with sign-in details. No-op if user has no WhatsApp.
// Uses the password the admin just typed (we have it in plaintext at the
// invite-form moment because the form submitted it).
async function sendWelcomeWhatsapp(args: {
  userId: string;
  username: string;
  whatsapp: string | null;
  password: string;
  role: 'broker' | 'owner';
  displayName: string | null;
}): Promise<void> {
  if (!args.whatsapp) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_HOST || 'https://limeinc.vercel.app';
  await enqueueNotification({
    reservationId: null,
    to: { userId: args.userId, phone: args.whatsapp, role: args.role },
    templateKey: 'admin_signin_details',
    language: 'en',
    context: {
      // Required NotifContext fields not used by this template
      boatName: '',
      bookingDate: '',
      shortRef: '',
      // Sign-in fields
      username: args.username,
      tempPassword: args.password,
      signinRole: args.role,
      appUrl,
      displayName: args.displayName,
    },
  });
  await flushPendingNonReservation();
}

export async function inviteBrokerAction(formData: FormData) {
  await requireBoatAdmin();
  const username = s(formData.get('username')).toLowerCase();
  const password = s(formData.get('password'));
  const wa = normalizeWhatsapp(s(formData.get('whatsapp')));
  if (wa === 'invalid') throw new Error('whatsapp_invalid');
  if (!username || password.length < 8) return;
  const result = await upsertUserWithRole({ username, password, whatsapp: wa, role: 'broker', ownerId: null });
  if ('userId' in result) {
    await sendWelcomeWhatsapp({
      userId: result.userId,
      username,
      whatsapp: wa,
      password,
      role: 'broker',
      displayName: null,   // never set on initial invite
    });
  }
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
    // Send welcome WhatsApp with sign-in details
    await sendWelcomeWhatsapp({
      userId: result.userId,
      username,
      whatsapp: wa,
      password,
      role: 'owner',
      displayName: null,
    });
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

// Re-send sign-in details: generate a fresh temp password, rotate it on
// the user, wipe their sessions, and WhatsApp them username + new password.
// Returns a discriminated result so the client can show toast + button state.
export async function sendSigninDetailsAction(
  formData: FormData
): Promise<
  | { ok: true; sent_at: string }
  | { ok: false; error: 'no_whatsapp' | 'not_found' | 'forbidden' | 'user_disabled' | 'enqueue_failed' }
> {
  const me = await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  if (!userId) return { ok: false, error: 'not_found' };

  const sb = supabaseAdmin();
  const { data: userRow } = await sb
    .from('app_users')
    .select('id, username, display_name, whatsapp, disabled_at')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow) return { ok: false, error: 'not_found' };
  const u = userRow as {
    id: string;
    username: string;
    display_name: string | null;
    whatsapp: string | null;
    disabled_at: string | null;
  };
  if (u.disabled_at) return { ok: false, error: 'user_disabled' };
  if (!u.whatsapp) return { ok: false, error: 'no_whatsapp' };

  // Determine sign-in role: broker > owner > admin
  const { data: roleRows } = await sb
    .from('boat_rental_user_roles')
    .select('role')
    .eq('user_id', userId);
  const roles = ((roleRows as Array<{ role: string }> | null) || []).map(r => r.role);
  const signinRole: 'broker' | 'owner' | 'admin' =
    roles.includes('broker') ? 'broker' :
    roles.includes('owner')  ? 'owner'  :
    'admin';

  // Rotate the password
  const newPassword = randomFriendlyPassword(12);
  await sb
    .from('app_users')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', userId);

  // Wipe existing sessions (force re-auth)
  await sb.from('app_sessions').delete().eq('user_id', userId);

  // Enqueue + flush WhatsApp
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_HOST || 'https://limeinc.vercel.app';
    await enqueueNotification({
      reservationId: null,
      to: { userId: u.id, phone: u.whatsapp, role: signinRole },
      templateKey: 'admin_signin_details',
      language: 'en',
      context: {
        boatName: '',
        bookingDate: '',
        shortRef: '',
        username: u.username,
        tempPassword: newPassword,
        signinRole,
        appUrl,
        displayName: u.display_name,
      },
    });
    await flushPendingNonReservation();
  } catch {
    return { ok: false, error: 'enqueue_failed' };
  }

  await logAudit({
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_signin_details_sent',
    payload: { user_id: userId, rotated_password: true, role: signinRole },
  });

  revalidatePath('/emails/boat-rental/admin/users');
  return { ok: true, sent_at: new Date().toISOString() };
}

// Set or clear display_name on an existing user. Empty string clears.
// 80-char cap; longer input is truncated rather than rejected so admins
// don't lose work.
export async function setUserDisplayNameAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  if (!userId) return;
  const raw = s(formData.get('display_name')).trim();
  const display_name = raw === '' ? null : raw.slice(0, 80);
  const sb = supabaseAdmin();
  await sb.from('app_users').update({ display_name }).eq('id', userId);
  revalidatePath('/emails/boat-rental/admin/users');
}

// Soft-disable / re-enable an account. Disable wipes existing sessions
// and refuses to disable the calling admin.
export async function setUserDisabledAction(formData: FormData): Promise<void> {
  const me = await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  const disabled = s(formData.get('disabled')) === 'true';
  if (!userId) return;
  if (disabled && userId === me.id) {
    throw new Error('cannot_disable_self');
  }
  const sb = supabaseAdmin();
  if (disabled) {
    await sb
      .from('app_users')
      .update({ disabled_at: new Date().toISOString(), disabled_by: me.id })
      .eq('id', userId);
    // Force logout
    await sb.from('app_sessions').delete().eq('user_id', userId);
    await logAudit({
      actorUserId: me.id,
      actorRole: 'admin',
      action: 'admin_user_disabled',
      payload: { user_id: userId },
    });
  } else {
    await sb
      .from('app_users')
      .update({ disabled_at: null, disabled_by: null })
      .eq('id', userId);
    await logAudit({
      actorUserId: me.id,
      actorRole: 'admin',
      action: 'admin_user_reenabled',
      payload: { user_id: userId },
    });
  }
  revalidatePath('/emails/boat-rental/admin/users');
}
