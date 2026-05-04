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

// Hard timeout wrapper for Gmail-side cleanup work — keeps the
// disconnect action from hanging on a dead refresh token.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms)
    ),
  ]);
}

export async function tagDomainPersonal(accountId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('accounts').select('*').eq('id', accountId).single();
  if (!acc) throw new Error('account_not_found');
  await sb.from('accounts').update({ domain: 'personal' }).eq('id', accountId);
  // Best-effort label creation — if tokens are bad, the next reconnect
  // re-runs ensureLabelsForAccount.
  try {
    await withTimeout(ensureLabelsForAccount(acc as any), 30_000, 'label_create');
  } catch (e: any) {
    console.error('[tagDomainPersonal] label create failed:', e?.message ?? e);
  }
  revalidatePath('/personal/email/setup/accounts');
}

// Disconnect = always untag in DB, optionally strip Gmail-side labels.
//
// Why best-effort: a dead refresh token (the most common reason a user
// wants to disconnect) makes the Gmail-side call fail. If we let that
// failure propagate, the action returns 500 and the DB stays tagged —
// the worst possible state because the user can't even retry the
// disconnect cleanly. So we catch + log + still flush the DB row.
export async function disconnectAccountAndRemoveLabels(accountId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('accounts').select('*').eq('id', accountId).single();
  if (!acc) throw new Error('account_not_found');

  // Attempt Gmail-side label cleanup (best-effort, 30 s cap).
  try {
    await withTimeout(removeAllLimeLabels(acc as any), 30_000, 'label_removal');
  } catch (e: any) {
    // Non-fatal. Common causes: invalid_grant, refresh-token timeout,
    // Gmail API quota. The labels stay in the user's mailbox but the
    // disconnect still proceeds. User can manually delete them in
    // Gmail later if desired.
    console.error('[disconnect] label removal failed (proceeding with DB cleanup):',
      e?.message ?? e);
  }

  // ALWAYS untag the row, regardless of what Gmail did. We keep the
  // row itself so historical email_logs stay intact.
  await sb
    .from('accounts')
    .update({ domain: null, enabled: false })
    .eq('id', accountId);

  revalidatePath('/personal/email/setup/accounts');
}
