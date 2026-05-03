'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { ensureLabelsForAccount, removeAllLimeLabels } from '@/lib/personal-email/label-sync';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
  return u;
}

export async function tagDomainPersonal(accountId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('accounts').select('*').eq('id', accountId).single();
  if (!acc) throw new Error('account_not_found');
  await sb.from('accounts').update({ domain: 'personal' }).eq('id', accountId);
  await ensureLabelsForAccount(acc as any);
  revalidatePath('/personal/email/setup/accounts');
}

export async function disconnectAccountAndRemoveLabels(accountId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('accounts').select('*').eq('id', accountId).single();
  if (!acc) throw new Error('account_not_found');
  // 1. Strip Lime/* labels from Gmail.
  await removeAllLimeLabels(acc as any);
  // 2. Untag the account (keep the row so historical email_logs stay intact).
  await sb.from('accounts').update({ domain: null, enabled: false }).eq('id', accountId);
  revalidatePath('/personal/email/setup/accounts');
}
