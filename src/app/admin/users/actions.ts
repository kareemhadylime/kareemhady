'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, getCurrentUser } from '@/lib/auth';
import { DOMAINS } from '@/lib/rules/presets';

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.is_admin) {
    throw new Error('forbidden');
  }
  return me;
}

// Normalise a mobile number to E.164-ish (strip everything except + and digits).
// Empty string returns null so the partial-unique index allows NULL.
function normaliseMobile(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  return cleaned || null;
}

function normaliseEmail(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Light validation; the DB unique index enforces collision protection.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function normalisePosition(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 80);
  return trimmed || null;
}

export async function createUserAction(formData: FormData) {
  const me = await requireAdmin();
  const username = String(formData.get('username') || '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || 'viewer');
  const mobile_number = normaliseMobile(String(formData.get('mobile_number') || ''));
  const email = normaliseEmail(String(formData.get('email') || ''));
  const position = normalisePosition(String(formData.get('position') || ''));
  if (!username || password.length < 8) return;
  if (!['admin', 'editor', 'viewer'].includes(role)) return;

  const sb = supabaseAdmin();
  await sb.from('app_users').insert({
    username,
    password_hash: hashPassword(password),
    role,
    mobile_number,
    email,
    position,
  });
  revalidatePath('/admin/users');
  void me;
}

export async function updateUserAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const role = String(formData.get('role') || '');
  if (!id || !['admin', 'editor', 'viewer'].includes(role)) return;
  const sb = supabaseAdmin();
  await sb.from('app_users').update({ role }).eq('id', id);
  revalidatePath('/admin/users');
}

// Profile-only update — does NOT touch role or domain access.
// Used by the unlocked Edit panel for mobile/email/position.
export async function updateUserProfileAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') || '');
  if (!id) return;
  const mobile_number = normaliseMobile(String(formData.get('mobile_number') || ''));
  const email = normaliseEmail(String(formData.get('email') || ''));
  const position = normalisePosition(String(formData.get('position') || ''));
  const sb = supabaseAdmin();
  await sb.from('app_users').update({
    mobile_number,
    email,
    position,
  }).eq('id', id);
  revalidatePath('/admin/users');
}

export async function deleteUserAction(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get('id') || '');
  if (!id || id === me.id) return;
  const sb = supabaseAdmin();
  await sb.from('app_users').delete().eq('id', id);
  revalidatePath('/admin/users');
}

export async function setDomainRolesAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('user_id') || '');
  if (!userId) return;
  const sb = supabaseAdmin();
  // Collect the checked domains
  const checkedDomains: string[] = [];
  for (const d of DOMAINS) {
    if (formData.get(`domain:${d}`)) checkedDomains.push(d);
  }
  // Replace entire role set for this user
  await sb.from('app_user_domain_roles').delete().eq('user_id', userId);
  if (checkedDomains.length > 0) {
    await sb.from('app_user_domain_roles').insert(
      checkedDomains.map(d => ({
        user_id: userId,
        domain: d,
        role: 'viewer',
      }))
    );
  }
  revalidatePath('/admin/users');
}

// ---- State-returning variants ----
// React 19's `useActionState` requires actions of shape
// `(prev, formData) => result`. The void-returning variants above work for
// plain `<form action={...}>` but give the user no in-page feedback. The
// edit panel uses these wrappers so it can render "Saved" inline + auto-
// collapse after success without a roundtrip-and-redirect dance.
export type SaveResult =
  | { ok: true; saved: 'profile' | 'role' | 'domains' }
  | { ok: false; saved: 'profile' | 'role' | 'domains'; error: string };

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}

export async function updateUserProfileStateAction(
  _prev: SaveResult | null,
  formData: FormData
): Promise<SaveResult> {
  try {
    await updateUserProfileAction(formData);
    return { ok: true, saved: 'profile' };
  } catch (e) {
    return { ok: false, saved: 'profile', error: errMsg(e) };
  }
}

export async function updateUserRoleStateAction(
  _prev: SaveResult | null,
  formData: FormData
): Promise<SaveResult> {
  try {
    await updateUserAction(formData);
    return { ok: true, saved: 'role' };
  } catch (e) {
    return { ok: false, saved: 'role', error: errMsg(e) };
  }
}

export async function setDomainRolesStateAction(
  _prev: SaveResult | null,
  formData: FormData
): Promise<SaveResult> {
  try {
    await setDomainRolesAction(formData);
    return { ok: true, saved: 'domains' };
  } catch (e) {
    return { ok: false, saved: 'domains', error: errMsg(e) };
  }
}
