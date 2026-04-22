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

export async function createUserAction(formData: FormData) {
  const me = await requireAdmin();
  const username = String(formData.get('username') || '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || 'viewer');
  if (!username || password.length < 8) return;
  if (!['admin', 'editor', 'viewer'].includes(role)) return;

  const sb = supabaseAdmin();
  await sb.from('app_users').insert({
    username,
    password_hash: hashPassword(password),
    role,
  });
  revalidatePath('/admin/users');
  // Avoid unused-var lint on `me`.
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
