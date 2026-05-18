'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, getCurrentUser } from '@/lib/auth';
import {
  FMPLUS_ROLE_PRESETS,
  type FmplusPerms,
  type FmplusRolePreset,
} from '@/lib/fmplus/setup/roles';

const VALID_PRESETS: ReadonlySet<FmplusRolePreset> = new Set(
  FMPLUS_ROLE_PRESETS.map((p) => p.key),
);

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.is_admin) throw new Error('forbidden');
  return me;
}

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function normaliseName(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 80);
  return trimmed || null;
}

function parsePresetOrNull(raw: string | null): FmplusRolePreset | null {
  if (!raw) return null;
  return VALID_PRESETS.has(raw as FmplusRolePreset) ? (raw as FmplusRolePreset) : null;
}

function parsePermsJson(raw: string | null): FmplusPerms | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    // Sanity: strip fields we don't recognize. Server is the trust boundary.
    const out: FmplusPerms = {};
    if (parsed.financials === 'none' || parsed.financials === 'view') out.financials = parsed.financials;
    if (parsed.budget === 'none' || parsed.budget === 'view' || parsed.budget === 'edit') out.budget = parsed.budget;
    if (parsed.performance === 'none' || parsed.performance === 'view') out.performance = parsed.performance;
    if (parsed.shift_reports === 'none' || parsed.shift_reports === 'view' || parsed.shift_reports === 'submit' || parsed.shift_reports === 'configure') out.shift_reports = parsed.shift_reports;
    if (parsed.setup === true || parsed.setup === false) out.setup = parsed.setup;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export type FmplusSaveResult =
  | { ok: true;  saved: 'profile' | 'role' | 'password' | 'disabled' }
  | { ok: false; saved: 'profile' | 'role' | 'password' | 'disabled'; error: string };

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}

// ──────────────────────────────────────────────────────────────────────
// Create — used by the top-of-page form on /fmplus/setup/users
// ──────────────────────────────────────────────────────────────────────

export async function createFmplusUserAction(formData: FormData) {
  await requireAdmin();
  const full_name    = normaliseName(String(formData.get('full_name') || ''));
  const username     = String(formData.get('username') || '').trim().toLowerCase();
  const password     = String(formData.get('password') || '');
  const mobile_number = normaliseMobile(String(formData.get('mobile_number') || ''));
  const email        = normaliseEmail(String(formData.get('email') || ''));
  const fmplus_role  = parsePresetOrNull(String(formData.get('fmplus_role') || ''));
  const fmplus_perms = parsePermsJson(String(formData.get('fmplus_perms') || ''));

  if (!username || password.length < 8 || !fmplus_role) return;

  const sb = supabaseAdmin();
  // Insert app_users row. Global role = 'editor' so they have write capability
  // on the domains they're granted. Admins remain admin via /admin/users.
  const { data: insertedRaw, error: insErr } = await sb
    .from('app_users')
    .insert({
      username,
      password_hash: hashPassword(password),
      role:          'editor',
      full_name,
      mobile_number,
      email,
      fmplus_role,
      fmplus_perms,
    })
    .select('id')
    .single();
  if (insErr || !insertedRaw) return;
  const inserted = insertedRaw as { id: string };

  // Auto-grant fmplus domain access so the user shows up in this list.
  await sb.from('app_user_domain_roles').insert({
    user_id: inserted.id,
    domain:  'fmplus',
    role:    'editor',
  });

  revalidatePath('/fmplus/setup/users');
}

// ──────────────────────────────────────────────────────────────────────
// Edit profile (name / mobile / email)
// ──────────────────────────────────────────────────────────────────────

async function updateFmplusUserProfile(formData: FormData) {
  await requireAdmin();
  const id            = String(formData.get('id') || '');
  if (!id) return;
  const full_name     = normaliseName(String(formData.get('full_name') || ''));
  const mobile_number = normaliseMobile(String(formData.get('mobile_number') || ''));
  const email         = normaliseEmail(String(formData.get('email') || ''));

  const sb = supabaseAdmin();
  await sb.from('app_users').update({
    full_name,
    mobile_number,
    email,
  }).eq('id', id);
  revalidatePath('/fmplus/setup/users');
}

export async function updateFmplusUserProfileStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await updateFmplusUserProfile(formData);
    return { ok: true, saved: 'profile' };
  } catch (e) {
    return { ok: false, saved: 'profile', error: errMsg(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Edit FM+ role (preset + optional advanced overrides)
// ──────────────────────────────────────────────────────────────────────

async function setFmplusUserRole(formData: FormData) {
  await requireAdmin();
  const id           = String(formData.get('id') || '');
  if (!id) return;
  const fmplus_role  = parsePresetOrNull(String(formData.get('fmplus_role') || ''));
  const fmplus_perms = parsePermsJson(String(formData.get('fmplus_perms') || ''));
  if (!fmplus_role) return;

  const sb = supabaseAdmin();
  await sb.from('app_users').update({
    fmplus_role,
    fmplus_perms,
  }).eq('id', id);
  revalidatePath('/fmplus/setup/users');
}

export async function setFmplusUserRoleStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await setFmplusUserRole(formData);
    return { ok: true, saved: 'role' };
  } catch (e) {
    return { ok: false, saved: 'role', error: errMsg(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Reset password (admin types a new password)
// ──────────────────────────────────────────────────────────────────────

async function resetFmplusUserPassword(formData: FormData) {
  await requireAdmin();
  const id          = String(formData.get('id') || '');
  const newPassword = String(formData.get('new_password') || '');
  if (!id || newPassword.length < 8) throw new Error('password must be at least 8 chars');
  const sb = supabaseAdmin();
  await sb.from('app_users')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', id);
  revalidatePath('/fmplus/setup/users');
}

export async function resetFmplusPasswordStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await resetFmplusUserPassword(formData);
    return { ok: true, saved: 'password' };
  } catch (e) {
    return { ok: false, saved: 'password', error: errMsg(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Disable / enable account (sets/clears app_users.disabled_at)
// ──────────────────────────────────────────────────────────────────────

async function setFmplusUserDisabled(formData: FormData) {
  const me = await requireAdmin();
  const id       = String(formData.get('id') || '');
  const disabled = formData.get('disabled') === '1';
  if (!id) return;
  if (id === me.id) throw new Error('cannot disable yourself');
  const sb = supabaseAdmin();
  await sb.from('app_users')
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq('id', id);
  // When disabling, kill any active sessions so the user is logged out.
  if (disabled) {
    await sb.from('app_sessions').delete().eq('user_id', id);
  }
  revalidatePath('/fmplus/setup/users');
}

export async function setFmplusUserDisabledStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await setFmplusUserDisabled(formData);
    return { ok: true, saved: 'disabled' };
  } catch (e) {
    return { ok: false, saved: 'disabled', error: errMsg(e) };
  }
}
