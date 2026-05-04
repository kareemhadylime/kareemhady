'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { ensureLabelsForAccount, removeAllLimeLabels } from '@/lib/personal-email/label-sync';
import { getGmailClientFromRefresh } from '@/lib/gmail';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';

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

// Backfill operation: for each personal mailbox, find every INBOX
// message received BEFORE `cutoff` (YYYY-MM-DD), mark them read +
// remove the INBOX label (= archive), then reset that account's
// last_synced_at to the cutoff so the next ingest fetches everything
// from the cutoff onwards as if brand new.
//
// Best-effort per account — if Gmail throws (dead token, rate limit),
// we log + continue. The DB-side last_synced_at update is critical and
// runs even if Gmail-side cleanup fails.
//
// Returns nothing useful via UI today; results land in console + DB.
// Caller (UI form) just gets a redirect after the action settles.
export async function archiveOldAndResetSync(formData: FormData): Promise<void> {
  await requireAdmin();
  const cutoff = String(formData.get('cutoff') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    throw new Error(`bad_cutoff: "${cutoff}" must be YYYY-MM-DD`);
  }
  const cutoffGmail = cutoff.replace(/-/g, '/');
  const cutoffIso = `${cutoff}T00:00:00Z`;

  const sb = supabaseAdmin();
  const { data: accounts, error: accErr } = await sb
    .from('accounts')
    .select('id, email, display_name, oauth_refresh_token_encrypted')
    .eq('domain', 'personal')
    .eq('enabled', true);
  if (accErr) throw new Error(`accounts_query_failed: ${accErr.message}`);

  for (const acc of (accounts ?? [])) {
    const summary: Record<string, unknown> = { email: acc.email };
    try {
      const gmail = await withTimeout(
        getGmailClientFromRefresh(acc.oauth_refresh_token_encrypted),
        8_000,
        `token_refresh_${acc.email}`,
      );

      // Page through every pre-cutoff INBOX id.
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const list = await gmail.users.messages.list({
          userId: 'me',
          q: `before:${cutoffGmail} in:inbox -in:trash`,
          maxResults: 500,
          pageToken,
        });
        for (const m of list.data.messages ?? []) {
          if (m.id) ids.push(m.id);
        }
        pageToken = list.data.nextPageToken ?? undefined;
      } while (pageToken);

      // Batch-archive 1000 at a time (Gmail batchModify cap).
      const CHUNK = 1000;
      let archived = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        try {
          await gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: { ids: chunk, removeLabelIds: ['UNREAD', 'INBOX'] },
          });
          archived += chunk.length;
        } catch (e: any) {
          console.error(`[archiveOld] batchModify failed for ${acc.email}:`, e?.message ?? e);
        }
      }
      summary.before_cutoff = ids.length;
      summary.archived = archived;
    } catch (e: any) {
      summary.error = String(e?.message ?? e).slice(0, 200);
    }

    // Always reset last_synced_at so the next ingest pulls from the
    // cutoff forward — even if the Gmail-side archive failed.
    try {
      await sb
        .from('accounts')
        .update({ last_synced_at: cutoffIso })
        .eq('id', acc.id);
      summary.last_synced_at_set_to = cutoffIso;
    } catch (e: any) {
      summary.last_synced_update_error = String(e?.message ?? e).slice(0, 200);
    }
    console.log('[archiveOld]', summary);
  }

  // Kick off an ingest immediately so the user sees data flow without
  // waiting 15 min for the next cron tick. Non-fatal if it fails — the
  // cron will pick up.
  try {
    await ingestPersonalEmails({ trigger: 'manual' });
  } catch (e: any) {
    console.error('[archiveOld] post-archive ingest failed:', e?.message ?? e);
  }

  revalidatePath('/personal/email');
  revalidatePath('/personal/email/setup/accounts');
}
