'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getCurrentUser,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
} from '@/lib/auth';

// Server action bound to /account/password. Takes current + new (x2) from
// form-data, verifies the old password, rotates the hash, and invalidates
// every OTHER session owned by this user (keeps the one that just issued
// the request). Forces anyone logged in elsewhere to re-authenticate.

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/account/password');
  }

  const currentPassword = String(formData.get('current_password') || '');
  const newPassword = String(formData.get('new_password') || '');
  const confirmPassword = String(formData.get('confirm_password') || '');

  function bounce(err: string) {
    redirect(`/account/password?err=${encodeURIComponent(err)}`);
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    bounce('missing_fields');
  }
  if (newPassword !== confirmPassword) {
    bounce('mismatch');
  }
  if (newPassword.length < 10) {
    bounce('too_short');
  }
  if (newPassword === currentPassword) {
    bounce('same_password');
  }

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('app_users')
    .select('password_hash')
    .eq('id', user.id)
    .maybeSingle();
  const stored = (row as { password_hash: string } | null)?.password_hash || '';
  if (!verifyPassword(currentPassword, stored)) {
    bounce('wrong_current');
  }

  const newHash = hashPassword(newPassword);
  await sb
    .from('app_users')
    .update({ password_hash: newHash })
    .eq('id', user.id);

  // Invalidate all other sessions so a leaked cookie can't outlive the
  // password rotation. Keep the session that issued this request.
  const jar = await cookies();
  const currentToken = jar.get(SESSION_COOKIE)?.value || '';
  if (currentToken) {
    await sb
      .from('app_sessions')
      .delete()
      .eq('user_id', user.id)
      .neq('token', currentToken);
  }

  redirect('/account/password?ok=1');
}
