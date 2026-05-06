import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';

// Rich mailbox bar: each mailbox renders as a clickable card showing
//   • display name (bold)
//   • full email (mono small)
//   • freshness bar — % of a 24-hour staleness budget remaining
//   • count of emails classified in this mailbox + delta in last 24h
//   • status dot: healthy / stale / cold
//   • per-account error hint if the most recent ingest run flagged it
//
// Doubles as the account filter — clicking a card scopes the page.
//
// Freshness signal: derived from MAX(accounts.last_synced_at,
// MAX(email_logs.last_classified_at)). The first column only advances
// when an entire sweep completes — for large backlog accounts (e.g.
// post-backfill LIME) the function times out before the cursor moves,
// so an account looks "synced 7d ago" while actively classifying
// thousands of emails. The MAX of activity gives a truthful picture.

const STALE_GREEN_MS = 30 * 60 * 1000;       // < 30 min  = healthy
const FRESHNESS_WINDOW_MS = 24 * 3600 * 1000; // 24-h freshness budget

type Mailbox = {
  id: string;
  email: string;
  display_name: string | null;
  last_synced_at: string | null;
};

type MailboxStats = {
  mailbox: Mailbox;
  effectiveSyncIso: string | null;     // MAX(last_synced_at, max last_classified_at)
  cursorBehind: boolean;                // true when the actual sweep cursor is far behind real activity
  classifiedTotal: number;
  classifiedLast24h: number;
  hadErrorOnLastRun: boolean;
  lastRunErrorMsg: string | null;
};

export async function MailboxStatusBar({
  selected,
  basePath = '/personal/email',
}: {
  selected?: string;
  basePath?: string;
}) {
  const sb = supabaseAdmin();

  const [{ data: accountsData }, { data: classifiedRows }, { data: lastRun }] =
    await Promise.all([
      sb
        .from('accounts')
        .select('id, email, display_name, last_synced_at')
        .eq('domain', 'personal')
        .eq('enabled', true)
        .order('display_name', { nullsFirst: false }),
      sb
        .from('email_logs')
        .select('account_id, last_classified_at, accounts!inner(domain)')
        .eq('accounts.domain', 'personal')
        .not('category', 'is', null),
      sb
        .from('personal_email_classification_runs')
        .select('errors')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const mailboxes = (accountsData ?? []) as Mailbox[];

  if (!mailboxes.length) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        No mailboxes connected.{' '}
        <Link href="/personal/email/setup/accounts" className="ix-link">
          Connect Gmail
        </Link>
      </div>
    );
  }

  // Count classified rows per account, plus those classified in the
  // last 24 h (a rough "throughput" proxy). Also track the latest
  // last_classified_at per account — that's the truthful signal of
  // recent activity, since `accounts.last_synced_at` only advances on
  // full sweep completion (which times out for big backlogs).
  const totalByAccount = new Map<string, number>();
  const last24hByAccount = new Map<string, number>();
  const latestActivityByAccount = new Map<string, number>();
  const cutoff24h = Date.now() - FRESHNESS_WINDOW_MS;
  for (const r of (classifiedRows ?? []) as any[]) {
    const id = r.account_id as string;
    totalByAccount.set(id, (totalByAccount.get(id) ?? 0) + 1);
    const ts = r.last_classified_at ? new Date(r.last_classified_at).getTime() : 0;
    if (ts >= cutoff24h) {
      last24hByAccount.set(id, (last24hByAccount.get(id) ?? 0) + 1);
    }
    if (ts > (latestActivityByAccount.get(id) ?? 0)) {
      latestActivityByAccount.set(id, ts);
    }
  }

  // Map of email → error message, sourced from the most recent run row.
  const errorsByEmail = new Map<string, string>();
  if (lastRun?.errors && Array.isArray(lastRun.errors)) {
    for (const e of lastRun.errors as any[]) {
      if (e?.account && typeof e.msg === 'string') {
        errorsByEmail.set(e.account, e.msg);
      }
    }
  }

  const stats: MailboxStats[] = mailboxes.map(m => {
    const cursorMs = m.last_synced_at ? new Date(m.last_synced_at).getTime() : 0;
    const activityMs = latestActivityByAccount.get(m.id) ?? 0;
    const effectiveMs = Math.max(cursorMs, activityMs);
    const effectiveSyncIso = effectiveMs > 0 ? new Date(effectiveMs).toISOString() : null;
    // "Cursor behind" = the sweep marker is hours older than real
    // classification activity (= big backlog still being chewed through).
    const cursorBehind = activityMs - cursorMs > 60 * 60 * 1000; // > 1 h gap
    return {
      mailbox: m,
      effectiveSyncIso,
      cursorBehind,
      classifiedTotal: totalByAccount.get(m.id) ?? 0,
      classifiedLast24h: last24hByAccount.get(m.id) ?? 0,
      hadErrorOnLastRun: errorsByEmail.has(m.email),
      lastRunErrorMsg: errorsByEmail.get(m.email) ?? null,
    };
  });

  const healthyCount = stats.filter(s => computeStatus(s.effectiveSyncIso) === 'healthy').length;

  return (
    <section className="ix-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
            Connected mailboxes
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            · {healthyCount}/{stats.length} healthy
          </span>
        </div>
        <Link
          href={`${basePath}`}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
            !selected
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
          }`}
        >
          All ({mailboxes.length})
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map(s => (
          <MailboxCard
            key={s.mailbox.id}
            stats={s}
            active={selected === s.mailbox.id}
            basePath={basePath}
          />
        ))}
      </div>
    </section>
  );
}

function MailboxCard({
  stats, active, basePath,
}: {
  stats: MailboxStats; active: boolean; basePath: string;
}) {
  const m = stats.mailbox;
  const href = `${basePath}?account=${m.id}`;
  const status = computeStatus(stats.effectiveSyncIso);
  const dotClass =
    status === 'healthy' ? 'bg-emerald-500' :
    status === 'stale'   ? 'bg-amber-500' :
                           'bg-rose-500';
  const tooltip =
    stats.effectiveSyncIso
      ? `Last activity: ${fmtCairoDateTime(stats.effectiveSyncIso)}` +
        (stats.cursorBehind && m.last_synced_at
          ? `\nSweep cursor still at ${fmtCairoDateTime(m.last_synced_at)} — backlog catching up.`
          : '')
      : 'Never synced';

  const pct = computeFreshnessPct(stats.effectiveSyncIso);
  const barColor =
    pct >= 60 ? 'bg-emerald-500' :
    pct >= 20 ? 'bg-amber-500'   :
                'bg-rose-500';

  return (
    <Link
      href={href}
      title={`${m.email} — ${tooltip}`}
      className={`block px-4 py-3 rounded-lg border transition ${
        active
          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} title={`Status: ${status}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold truncate ${active ? '' : 'text-slate-900 dark:text-slate-50'}`}>
            {m.display_name ?? m.email.split('@')[0].toUpperCase()}
          </div>
          <div className={`text-[10px] truncate font-mono ${active ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>
            {m.email}
          </div>
        </div>
        {stats.hadErrorOnLastRun ? (
          <AlertCircle size={14} className={active ? 'opacity-90' : 'text-rose-500'} />
        ) : status === 'healthy' ? (
          <CheckCircle2 size={14} className={active ? 'opacity-90' : 'text-emerald-500'} />
        ) : null}
      </div>

      {/* Freshness bar — fills inversely with last-activity age */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className={active ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}>
            {formatRelative(stats.effectiveSyncIso)}
            {stats.cursorBehind && (
              <span className={`ml-1 ${active ? 'opacity-90' : 'text-amber-600 dark:text-amber-400'}`}>
                · catching up
              </span>
            )}
          </span>
          <span className={`tabular-nums font-mono ${active ? 'opacity-90' : 'text-slate-600 dark:text-slate-300'}`}>
            {pct}%
          </span>
        </div>
        <div className={`h-1.5 rounded-full overflow-hidden ${active ? 'bg-white/30' : 'bg-slate-200 dark:bg-slate-700'}`}>
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Counts row */}
      <div className={`mt-2 flex items-center justify-between text-[10px] ${active ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>
        <span>
          <span className={`font-mono tabular-nums ${active ? '' : 'text-slate-700 dark:text-slate-200'}`}>
            {stats.classifiedTotal.toLocaleString()}
          </span>
          {' classified'}
        </span>
        {stats.classifiedLast24h > 0 && (
          <span>
            +{stats.classifiedLast24h} last 24h
          </span>
        )}
      </div>

      {/* Error hint — visible only when this mailbox failed in the most recent run */}
      {stats.hadErrorOnLastRun && stats.lastRunErrorMsg && (
        <div className={`mt-2 text-[10px] truncate ${active ? 'opacity-90' : 'text-rose-600 dark:text-rose-400'}`}
             title={stats.lastRunErrorMsg}>
          ⚠ {summarizeError(stats.lastRunErrorMsg)}
        </div>
      )}
    </Link>
  );
}

function computeStatus(iso: string | null): 'healthy' | 'stale' | 'cold' {
  if (!iso) return 'cold';
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < STALE_GREEN_MS) return 'healthy';
  if (ageMs < FRESHNESS_WINDOW_MS) return 'stale';
  return 'cold';
}

// Maps sync age onto a 0-100% freshness score against a 24-h budget.
// 0 ms ago → 100. 24+ h ago → 0. Linear in between.
function computeFreshnessPct(iso: string | null): number {
  if (!iso) return 0;
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs <= 0) return 100;
  if (ageMs >= FRESHNESS_WINDOW_MS) return 0;
  return Math.round(100 * (1 - ageMs / FRESHNESS_WINDOW_MS));
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never synced';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60 * 1000) return 'synced just now';
  const m = Math.floor(diffMs / 60000);
  if (m < 60) return `synced ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `synced ${h}h ago`;
  const d = Math.floor(h / 24);
  return `synced ${d}d ago`;
}

// Strip nested error wrappers down to a short pill-friendly hint.
function summarizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('token_refresh') && lower.includes('timeout')) return 'token refresh timed out';
  if (lower.includes('invalid_grant')) return 'refresh token invalid — reconnect';
  if (lower.includes('unauthorized') || lower.includes('401')) return 'auth expired — reconnect';
  // The "account_ingest_<email>_timeout_<ms>ms" error is most often
  // benign for accounts with a large backlog: classifications still
  // happen but the function ran out of budget before finishing the
  // sweep. Don't alarm the user when forward progress is being made.
  if (lower.includes('account_ingest') && lower.includes('timeout')) return 'still catching up — large backlog';
  return msg.slice(0, 64);
}
