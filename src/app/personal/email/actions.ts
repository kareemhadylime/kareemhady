'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncLabelChange } from '@/lib/personal-email/label-sync';
import type { CategorySlug } from '@/lib/personal-email/types';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';
import { markMessagesAsRead } from '@/lib/gmail';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
  return u;
}

export async function moveEmail(
  emailLogId: string, newCategory: CategorySlug,
): Promise<void> {
  const user = await requireAdmin();
  const sb = supabaseAdmin();

  const { data: row, error: rErr } = await sb
    .from('email_logs')
    .select('id, account_id, gmail_message_id, category, accounts(id, oauth_refresh_token_encrypted, email, display_name, domain)')
    .eq('id', emailLogId)
    .single();
  if (rErr || !row) throw new Error('email_not_found');

  const oldCategory = (row.category ?? null) as CategorySlug | null;

  // 1. Update DB.
  await sb.from('email_logs').update({
    category: newCategory,
    category_method: 'manual',
    category_reason: 'user_moved',
    needs_review: false,
    last_classified_at: new Date().toISOString(),
  }).eq('id', emailLogId);

  // 2. Audit log.
  await sb.from('personal_email_corrections').insert({
    email_log_id: emailLogId,
    old_category: oldCategory,
    new_category: newCategory,
    created_by_user_id: user.id ?? null,
  });

  // 3. Push to Gmail.
  if (oldCategory !== newCategory && (row as any).accounts) {
    try {
      await syncLabelChange(
        (row as any).accounts,
        row.gmail_message_id,
        oldCategory,
        newCategory,
      );
    } catch (e) {
      console.error('[moveEmail] label sync failed', e);
    }
  }

  revalidatePath('/personal/email');
}

export async function archiveInGmail(emailLogIds: string[]): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('email_logs')
    .select('gmail_message_id, accounts(oauth_refresh_token_encrypted)')
    .in('id', emailLogIds);
  // Group by account so we issue one batchModify per account.
  const byAccount = new Map<string, string[]>();
  for (const r of (rows ?? []) as any[]) {
    const tok = r.accounts?.oauth_refresh_token_encrypted;
    if (!tok) continue;
    const list = byAccount.get(tok) ?? [];
    list.push(r.gmail_message_id);
    byAccount.set(tok, list);
  }
  for (const [tok, ids] of byAccount) {
    const { getGmailClientFromRefresh } = await import('@/lib/gmail');
    const gmail = await getGmailClientFromRefresh(tok);
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: { ids, removeLabelIds: ['INBOX'] },
    });
  }
  // Mirror the Gmail-side change in our local mirror so the UI's
  // "marked rows pin to top until acted on" sort drops these rows
  // from the active tier immediately, without waiting for the next
  // cron tick to refresh label_ids from Gmail.
  await stripLabelLocally(emailLogIds, 'INBOX');
  revalidatePath('/personal/email');
}

export async function markAsRead(emailLogIds: string[]): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('email_logs')
    .select('gmail_message_id, accounts(oauth_refresh_token_encrypted)')
    .in('id', emailLogIds);
  const byAccount = new Map<string, string[]>();
  for (const r of (rows ?? []) as any[]) {
    const tok = r.accounts?.oauth_refresh_token_encrypted;
    if (!tok) continue;
    const list = byAccount.get(tok) ?? [];
    list.push(r.gmail_message_id);
    byAccount.set(tok, list);
  }
  for (const [tok, ids] of byAccount) {
    await markMessagesAsRead(tok, ids);
  }
  // Local mirror — same rationale as archiveInGmail.
  await stripLabelLocally(emailLogIds, 'UNREAD');
  revalidatePath('/personal/email');
}

// Remove a Gmail label from the local email_logs.label_ids array for
// the given email_logs ids. Postgres array_remove handles the strip.
// Used to keep the UI's marker-pin sort responsive without waiting on
// the next ingest cycle.
async function stripLabelLocally(emailLogIds: string[], label: string) {
  if (!emailLogIds.length) return;
  const sb = supabaseAdmin();
  // Pull current arrays, strip in JS, write back. (Supabase JS doesn't
  // expose array_remove directly; raw SQL via rpc is overkill for this.)
  const { data } = await sb
    .from('email_logs')
    .select('id, label_ids')
    .in('id', emailLogIds);
  for (const r of (data ?? []) as any[]) {
    const arr = Array.isArray(r.label_ids) ? r.label_ids as string[] : [];
    const next = arr.filter(l => l !== label);
    if (next.length === arr.length) continue; // nothing to strip
    await sb.from('email_logs').update({ label_ids: next }).eq('id', r.id);
  }
}

export async function manualRefresh(): Promise<void> {
  await requireAdmin();
  await ingestPersonalEmails({ trigger: 'manual' });
  revalidatePath('/personal/email');
}
