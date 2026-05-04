import { supabaseAdmin } from '@/lib/supabase';
import { getGmailClientFromRefresh } from '@/lib/gmail';
import { extractFeatures } from './feature-extractor';
import { classifyOneEmail } from './pipeline';
import { loadActiveRules } from './pipeline-db';
import { getRecentCorrectionsByCategory } from './corrections';
import { getDailyCostUsd, readDailyCapFromEnv } from './cost-guard';
import type { CategorySlug } from './types';

type Trigger = 'cron' | 'manual';

export type IngestOpts = {
  trigger: Trigger;
  /** Override default 24h lookback for the very first sync. */
  initialLookbackHours?: number;
};

const DEFAULT_INITIAL_LOOKBACK_HOURS = 24;

// Hard timeouts for the network-bound calls. Without these, a stale
// refresh token can hang the function indefinitely until Vercel kills
// it without flushing any progress to the run row. With them, a hung
// account fails fast and the loop moves on to the next mailbox.
const TOKEN_REFRESH_TIMEOUT_MS = 8_000;
const ACCOUNT_INGEST_TIMEOUT_MS = 90_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); },
           e => { clearTimeout(t); reject(e); });
  });
}

// Runs the full ingest for every account WHERE domain='personal' AND
// enabled=true. Returns the run id so the caller (cron route or
// manual-refresh server action) can surface progress.
export async function ingestPersonalEmails(opts: IngestOpts): Promise<{ runId: string }> {
  const sb = supabaseAdmin();
  const { data: run, error: runErr } = await sb
    .from('personal_email_classification_runs')
    .insert({ trigger: opts.trigger, started_at: new Date().toISOString() })
    .select()
    .single();
  if (runErr || !run) throw new Error(`open_run_failed: ${runErr?.message}`);

  const counters = {
    emails_seen: 0,
    emails_classified: 0,
    rules_matched: 0,
    ai_calls: 0,
    ai_cost_usd: 0,
  };
  const errors: any[] = [];
  const accountsHit: string[] = [];

  // Helper that flushes the current state of `counters` + `accountsHit`
  // + `errors` to the run row. Called after each account so that a mid-
  // loop function timeout still leaves a useful audit trail.
  const flushProgress = async (finished = false) => {
    await sb
      .from('personal_email_classification_runs')
      .update({
        accounts: accountsHit,
        emails_seen: counters.emails_seen,
        emails_classified: counters.emails_classified,
        rules_matched: counters.rules_matched,
        ai_calls: counters.ai_calls,
        ai_cost_usd: counters.ai_cost_usd,
        errors,
        ...(finished ? { finished_at: new Date().toISOString() } : {}),
      })
      .eq('id', run.id);
  };

  try {
    const { data: accounts } = await sb
      .from('accounts')
      .select('id, email, display_name, oauth_refresh_token_encrypted, last_synced_at, enabled')
      .eq('domain', 'personal')
      .eq('enabled', true);

    const rules = await loadActiveRules();
    const corrections = await getRecentCorrectionsByCategory(10);
    const dailyCap = readDailyCapFromEnv();

    for (const acc of (accounts ?? []) as any[]) {
      accountsHit.push(acc.email);
      // Persist progress BEFORE attempting the account, so even a
      // function-kill on the very next line leaves a breadcrumb of
      // which mailbox was being attempted.
      await flushProgress();
      try {
        await withTimeout(
          ingestOneAccount({
            account: acc, run_id: run.id, rules, corrections,
            dailyCap, counters, errors,
            initialLookbackHours: opts.initialLookbackHours ?? DEFAULT_INITIAL_LOOKBACK_HOURS,
          }),
          ACCOUNT_INGEST_TIMEOUT_MS,
          `account_ingest_${acc.email}`,
        );
        await sb
          .from('accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', acc.id);
      } catch (e: any) {
        errors.push({
          account: acc.email,
          msg: String(e?.message ?? e),
          at: new Date().toISOString(),
        });
        await flushProgress();
      }
    }

    await flushProgress(true);
    return { runId: run.id };
  } catch (e: any) {
    errors.push({ fatal: String(e?.message ?? e), at: new Date().toISOString() });
    await flushProgress(true);
    throw e;
  }
}

async function ingestOneAccount(args: {
  account: any; run_id: string; rules: any[]; corrections: any;
  dailyCap: number; counters: any; errors: any[]; initialLookbackHours: number;
}) {
  // Wrap the token-refresh handshake in its own short timeout so a
  // dead/expired refresh token fails in seconds rather than hanging
  // until the outer 90s account-ingest timeout fires.
  const gmail = await withTimeout(
    getGmailClientFromRefresh(args.account.oauth_refresh_token_encrypted),
    TOKEN_REFRESH_TIMEOUT_MS,
    `token_refresh_${args.account.email}`,
  );
  const sinceMs = args.account.last_synced_at
    ? new Date(args.account.last_synced_at).getTime()
    : Date.now() - args.initialLookbackHours * 3600 * 1000;
  const sinceQuery = `after:${Math.floor(sinceMs / 1000)} -in:trash -in:drafts`;

  let pageToken: string | undefined;
  do {
    const list = await gmail.users.messages.list({
      userId: 'me', q: sinceQuery, maxResults: 100, pageToken,
    });
    for (const m of list.data.messages ?? []) {
      if (!m.id) continue;
      args.counters.emails_seen += 1;
      try {
        await processOneMessage({
          ...args, gmail, gmailMessageId: m.id, gmailThreadId: m.threadId ?? null,
        });
      } catch (e: any) {
        args.errors.push({ msg_id: m.id, msg: String(e?.message ?? e) });
      }
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);
}

async function processOneMessage(args: {
  account: any; run_id: string; gmail: any; gmailMessageId: string;
  gmailThreadId: string | null;
  rules: any[]; corrections: any; dailyCap: number; counters: any;
}) {
  const sb = supabaseAdmin();
  const full = await args.gmail.users.messages.get({
    userId: 'me', id: args.gmailMessageId, format: 'full',
  });
  const payload = full.data.payload ?? {};
  const headerArr: { name?: string; value?: string }[] = payload.headers ?? [];
  const headerMap: Record<string, string> = {};
  for (const h of headerArr) if (h.name) headerMap[h.name] = h.value ?? '';

  const labelIds: string[] = (full.data.labelIds ?? []) as string[];
  const bodyExcerpt = extractBodyExcerpt(payload).slice(0, 8 * 1024);

  const features = extractFeatures({
    headers: headerMap, bodyExcerpt, gmailLabelIds: labelIds,
  });

  // Upsert the email_logs row (existing schema has unique(account_id, gmail_message_id)).
  const { data: upserted, error: upErr } = await sb
    .from('email_logs')
    .upsert({
      run_id: args.run_id,
      account_id: args.account.id,
      gmail_message_id: args.gmailMessageId,
      gmail_thread_id: args.gmailThreadId,
      from_address: features.fromAddress,
      to_address: features.toAddress,
      subject: features.subject,
      received_at: full.data.internalDate
        ? new Date(Number(full.data.internalDate)).toISOString()
        : null,
      snippet: full.data.snippet ?? null,
      label_ids: labelIds,
      body_excerpt: bodyExcerpt,
    }, { onConflict: 'account_id,gmail_message_id' })
    .select('id, category')
    .single();
  if (upErr) throw new Error(`upsert_email_log_failed: ${upErr.message}`);

  const oldCategory = (upserted?.category ?? null) as CategorySlug | null;
  const currentCost = await getDailyCostUsd();

  const out = await classifyOneEmail({
    account: args.account,
    emailLogId: upserted!.id,
    gmailMessageId: args.gmailMessageId,
    features,
    fromHeader: headerMap['From'] ?? '',
    toHeader: headerMap['To'] ?? '',
    oldCategory,
    twoWaySyncEnabled: true,
    rules: args.rules,
    recentCorrections: args.corrections,
    currentDailyCostUsd: currentCost,
    dailyCapUsd: args.dailyCap,
  });

  args.counters.emails_classified += 1;
  if (out.method === 'rule') args.counters.rules_matched += 1;
  if (out.method === 'ai') {
    args.counters.ai_calls += 1;
    args.counters.ai_cost_usd += out.ai_cost_usd;
  }
}

function extractBodyExcerpt(payload: any): string {
  // Walk MIME parts; prefer text/plain, fall back to stripped HTML.
  let text = '';
  function walk(part: any) {
    if (!part) return;
    const data = part.body?.data;
    if (data) {
      const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (part.mimeType === 'text/plain' && !text) text = decoded;
      else if (part.mimeType === 'text/html' && !text) text = stripHtml(decoded);
    }
    for (const c of part.parts ?? []) walk(c);
  }
  walk(payload);
  return text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
