'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncLabelChange } from '@/lib/personal-email/label-sync';
import { loadLabelMap } from '@/lib/personal-email/label-sync-db';
import { ensureLabelsForAccount } from '@/lib/personal-email/label-sync';
import type { CategorySlug } from '@/lib/personal-email/types';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';
import { getGmailClientFromRefresh, markMessagesAsRead } from '@/lib/gmail';
import { parseFromDomain } from '@/lib/personal-email/feature-extractor';

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
    .select('id, account_id, gmail_message_id, category, from_address, accounts(id, oauth_refresh_token_encrypted, email, display_name, domain)')
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

  // 4. Auto-rule: future emails from this sender should go to the same
  //    category. Skipped when the category didn't actually change, when
  //    the from-domain can't be parsed, or when an equivalent rule
  //    already exists. Stored as a global (account_id IS NULL) rule at
  //    priority 50 so it sits between user-customized rules and the
  //    catch-all priority-98 owner rule.
  if (oldCategory !== newCategory) {
    await ensureAutoRuleFromMove(row.from_address as string | null, newCategory);
  }

  revalidatePath('/personal/email');
}

// Looks at the moved email's from_address, pulls the apex+subdomain,
// and inserts a from_domain rule routing future mail to the same
// category. Idempotent — won't insert when an equivalent rule exists.
// Failure here is non-fatal so the move itself still succeeds.
async function ensureAutoRuleFromMove(
  fromHeader: string | null,
  targetCategory: CategorySlug,
): Promise<void> {
  if (!fromHeader) return;
  const fromDomain = parseFromDomain(fromHeader);
  if (!fromDomain) return;

  // Skip super-broad domains the user almost never wants a global rule
  // on — gmail.com / yahoo.com / outlook.com would over-route every
  // human contact into one bucket.
  const FREE_PROVIDER_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
    'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me',
    'protonmail.com',
  ]);
  if (FREE_PROVIDER_DOMAINS.has(fromDomain)) return;

  const sb = supabaseAdmin();
  const { data: existing, error: existErr } = await sb
    .from('personal_email_rules')
    .select('id, target_category')
    .eq('match_type', 'from_domain')
    .eq('match_value', fromDomain)
    .is('account_id', null)
    .maybeSingle();
  if (existErr) {
    console.error('[moveEmail] auto-rule lookup failed', existErr);
    return;
  }

  // If an equivalent rule already exists and points at the same target,
  // nothing to do. If the existing rule points elsewhere, update it
  // (latest move wins) so a manual re-route actually re-routes future
  // mail too. Either way, no duplicate row created.
  if (existing) {
    if (existing.target_category !== targetCategory) {
      await sb
        .from('personal_email_rules')
        .update({
          target_category: targetCategory,
          name: `Auto: ${fromDomain} → ${targetCategory} (from move)`,
          enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
    return;
  }

  const { error: insErr } = await sb.from('personal_email_rules').insert({
    priority: 50,
    name: `Auto: ${fromDomain} → ${targetCategory} (from move)`,
    match_type: 'from_domain',
    match_value: fromDomain,
    target_category: targetCategory,
    enabled: true,
  });
  if (insErr) console.error('[moveEmail] auto-rule insert failed', insErr);
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

// === "Select all in category" bulk actions =================================
//
// These act on EVERY email_logs row matching (category, accountId, INBOX)
// — not just the IDs the UI page rendered. The drill-down list caps at
// 500 rows, but the user can have thousands in a category and wants to
// archive / mark-read / move them in one click.
//
// Implementation: resolve matching rows server-side (one query), group by
// account-token (since Gmail batchModify is per-account), chunk to 1000
// per Gmail call (Gmail's batchModify cap), and mirror the change in the
// local email_logs.label_ids array so the UI updates without waiting for
// the next ingest tick.

type ResolvedAccount = {
  account_id: string;
  refresh_token: string;
  emailLogIds: string[];
  gmailIds: string[];
};

async function resolveCategoryRows(
  category: CategorySlug,
  accountId: string | undefined,
): Promise<ResolvedAccount[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('email_logs')
    .select('id, account_id, gmail_message_id, accounts!inner(domain, oauth_refresh_token_encrypted)')
    .eq('accounts.domain', 'personal')
    .eq('category', category)
    .contains('label_ids', ['INBOX']);
  if (accountId) q = q.eq('account_id', accountId);
  const { data, error } = await q;
  if (error) throw new Error(`resolve_category_rows_failed: ${error.message}`);
  const byAccount = new Map<string, ResolvedAccount>();
  for (const r of (data ?? []) as any[]) {
    const tok = r.accounts?.oauth_refresh_token_encrypted;
    if (!tok) continue;
    const entry: ResolvedAccount = byAccount.get(r.account_id) ?? {
      account_id: r.account_id,
      refresh_token: tok,
      emailLogIds: [],
      gmailIds: [],
    };
    entry.emailLogIds.push(r.id);
    entry.gmailIds.push(r.gmail_message_id);
    byAccount.set(r.account_id, entry);
  }
  return [...byAccount.values()];
}

// Gmail batchModify caps at 1000 ids per call.
const BATCH_MODIFY_CHUNK = 1000;

export async function archiveAllInCategory(
  category: CategorySlug,
  accountId?: string,
): Promise<{ archived: number }> {
  await requireAdmin();
  const groups = await resolveCategoryRows(category, accountId);
  let archived = 0;
  for (const g of groups) {
    const gmail = await getGmailClientFromRefresh(g.refresh_token);
    for (let i = 0; i < g.gmailIds.length; i += BATCH_MODIFY_CHUNK) {
      const chunk = g.gmailIds.slice(i, i + BATCH_MODIFY_CHUNK);
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: chunk, removeLabelIds: ['INBOX'] },
      });
      archived += chunk.length;
    }
    await stripLabelLocally(g.emailLogIds, 'INBOX');
  }
  revalidatePath('/personal/email');
  return { archived };
}

export async function markAllReadInCategory(
  category: CategorySlug,
  accountId?: string,
): Promise<{ marked: number }> {
  await requireAdmin();
  const groups = await resolveCategoryRows(category, accountId);
  let marked = 0;
  for (const g of groups) {
    // markMessagesAsRead already chunks internally; just pass the lot.
    const r = await markMessagesAsRead(g.refresh_token, g.gmailIds);
    marked += r.marked;
    await stripLabelLocally(g.emailLogIds, 'UNREAD');
  }
  revalidatePath('/personal/email');
  return { marked };
}

export async function moveAllInCategory(
  category: CategorySlug,
  targetCategory: CategorySlug,
  accountId?: string,
): Promise<{ moved: number }> {
  await requireAdmin();
  if (category === targetCategory) return { moved: 0 };
  const user = await getCurrentUser();
  const groups = await resolveCategoryRows(category, accountId);
  const sb = supabaseAdmin();
  let moved = 0;

  for (const g of groups) {
    // Per-account label map. Self-heal target label if missing.
    let map = await loadLabelMap(g.account_id);
    if (!map[targetCategory]) {
      const { data: acc } = await sb
        .from('accounts')
        .select('id, email, oauth_refresh_token_encrypted')
        .eq('id', g.account_id)
        .single();
      if (acc) {
        await ensureLabelsForAccount(acc as any);
        map = await loadLabelMap(g.account_id);
      }
    }
    const addId = map[targetCategory];
    if (!addId) {
      console.error('[moveAllInCategory] no_label_for_target', { account: g.account_id, target: targetCategory });
      continue;
    }
    const removeIds = map[category] ? [map[category]!] : [];

    const gmail = await getGmailClientFromRefresh(g.refresh_token);
    for (let i = 0; i < g.gmailIds.length; i += BATCH_MODIFY_CHUNK) {
      const chunk = g.gmailIds.slice(i, i + BATCH_MODIFY_CHUNK);
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: chunk, removeLabelIds: removeIds, addLabelIds: [addId] },
      });
    }

    // Update DB rows in chunks (Supabase .in() caps around 1000).
    const nowIso = new Date().toISOString();
    for (let i = 0; i < g.emailLogIds.length; i += BATCH_MODIFY_CHUNK) {
      const chunk = g.emailLogIds.slice(i, i + BATCH_MODIFY_CHUNK);
      await sb.from('email_logs').update({
        category: targetCategory,
        category_method: 'manual',
        category_reason: 'user_bulk_moved',
        needs_review: false,
        last_classified_at: nowIso,
      }).in('id', chunk);
      // Audit rows — one per email.
      await sb.from('personal_email_corrections').insert(
        chunk.map(id => ({
          email_log_id: id,
          old_category: category,
          new_category: targetCategory,
          created_by_user_id: user?.id ?? null,
        })),
      );
      moved += chunk.length;
    }
    // No auto-rule creation for bulk moves: a single user gesture covering
    // 100s of senders should not spawn 100s of from_domain rules. moveEmail
    // (single-row path) keeps creating rules; this is the bulk exception.
  }
  revalidatePath('/personal/email');
  return { moved };
}

export async function manualRefresh(): Promise<void> {
  await requireAdmin();
  await ingestPersonalEmails({ trigger: 'manual' });
  revalidatePath('/personal/email');
}
