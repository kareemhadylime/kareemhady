'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncLabelChange } from '@/lib/personal-email/label-sync';
import { CategorySlug } from '@/lib/personal-email/schema';
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
  revalidatePath('/personal/email');
}

export async function manualRefresh(): Promise<void> {
  await requireAdmin();
  await ingestPersonalEmails({ trigger: 'manual' });
  revalidatePath('/personal/email');
}
