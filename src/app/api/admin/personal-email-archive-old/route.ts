import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGmailClientFromRefresh } from '@/lib/gmail';

// One-shot administrative route: for each personal mailbox, find every
// INBOX message received BEFORE `?cutoff=YYYY-MM-DD`, mark it read +
// remove the INBOX label (= archive), then reset the account's
// `last_synced_at` to that cutoff so the next ingest tick fetches
// everything from the cutoff onwards as if it were brand-new mail.
//
// Auth: same Bearer CRON_SECRET as the cron routes.
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     "https://limeinc.vercel.app/api/admin/personal-email-archive-old?cutoff=2026-04-15"
//
// Optional query params:
//   ?dry_run=1     — count only, no writes
//   ?account=<id>  — restrict to a single account_id
//
// Vercel Pro lambdas are capped at 5 min default. If a single account
// has tens of thousands of pre-cutoff messages, run with ?dry_run=1
// first to estimate, then run per-account via ?account=… in separate
// invocations.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ARCHIVE_CHUNK = 1000;       // Gmail batchModify cap
const FETCH_PAGE_SIZE = 500;      // largest list page Gmail allows

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const cutoff = url.searchParams.get('cutoff') ?? '';
  const dryRun = url.searchParams.get('dry_run') === '1';
  const onlyAccountId = url.searchParams.get('account') || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    return NextResponse.json(
      { error: 'bad_cutoff', hint: 'cutoff must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  // Gmail's `before:` operator is YYYY/MM/DD.
  const cutoffGmail = cutoff.replace(/-/g, '/');
  const cutoffIsoMidnight = `${cutoff}T00:00:00Z`;

  const sb = supabaseAdmin();
  let q = sb
    .from('accounts')
    .select('id, email, display_name, oauth_refresh_token_encrypted, last_synced_at')
    .eq('domain', 'personal')
    .eq('enabled', true);
  if (onlyAccountId) q = q.eq('id', onlyAccountId);
  const { data: accounts, error: accErr } = await q;
  if (accErr) {
    return NextResponse.json({ error: 'accounts_query_failed', detail: accErr.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const acc of (accounts ?? [])) {
    const r: any = {
      email: acc.email,
      display_name: acc.display_name,
    };
    try {
      const gmail = await getGmailClientFromRefresh(acc.oauth_refresh_token_encrypted);

      // 1. Page through every message matching `before:<cutoff> in:inbox`.
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const list = await gmail.users.messages.list({
          userId: 'me',
          q: `before:${cutoffGmail} in:inbox -in:trash`,
          maxResults: FETCH_PAGE_SIZE,
          pageToken,
        });
        for (const m of list.data.messages ?? []) {
          if (m.id) ids.push(m.id);
        }
        pageToken = list.data.nextPageToken ?? undefined;
      } while (pageToken);

      r.before_cutoff_count = ids.length;

      // 2. batchModify in chunks: removeLabelIds = ['UNREAD','INBOX']
      //    (= mark read + archive). Add nothing.
      let archived = 0;
      let archiveErrors = 0;
      if (!dryRun && ids.length > 0) {
        for (let i = 0; i < ids.length; i += ARCHIVE_CHUNK) {
          const chunk = ids.slice(i, i + ARCHIVE_CHUNK);
          try {
            await gmail.users.messages.batchModify({
              userId: 'me',
              requestBody: {
                ids: chunk,
                removeLabelIds: ['UNREAD', 'INBOX'],
              },
            });
            archived += chunk.length;
          } catch (e: any) {
            archiveErrors += chunk.length;
            if (!r.batchModify_first_error) {
              r.batchModify_first_error = String(e?.message ?? e).slice(0, 200);
            }
          }
        }
      }
      r.archived = archived;
      if (archiveErrors > 0) r.archive_errors = archiveErrors;

      // 3. Reset last_synced_at to cutoff so next ingest pulls everything
      //    from the cutoff forward.
      if (!dryRun) {
        const { error: upErr } = await sb
          .from('accounts')
          .update({ last_synced_at: cutoffIsoMidnight })
          .eq('id', acc.id);
        if (upErr) r.last_synced_update_error = upErr.message;
        else r.last_synced_at_set_to = cutoffIsoMidnight;
      }
    } catch (e: any) {
      r.error = String(e?.message ?? e).slice(0, 300);
    }
    results.push(r);
  }

  return NextResponse.json({
    cutoff,
    dry_run: dryRun,
    only_account_id: onlyAccountId,
    accounts: results,
  });
}
