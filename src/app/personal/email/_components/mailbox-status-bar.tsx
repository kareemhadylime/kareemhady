import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';

// Rich mailbox bar: displays each connected personal mailbox as a
// clickable pill with display name + email + last-sync time + a green
// dot for "synced in the last 30 min", amber for "stale (≤24h)", red
// for ">24h or never". Doubles as the account filter (clicking a pill
// scopes the rest of the page to that account).
//
// Replaces the bare AccountFilter pills on /personal/email — the user
// previously couldn't tell which physical mailbox each pill represented.

const STALE_GREEN_MS = 30 * 60 * 1000;       // < 30 min = healthy
const STALE_AMBER_MS = 24 * 3600 * 1000;     // < 24 h  = stale-warning

type Mailbox = {
  id: string;
  email: string;
  display_name: string | null;
  last_synced_at: string | null;
};

export async function MailboxStatusBar({
  selected,
  basePath = '/personal/email',
}: {
  selected?: string;
  basePath?: string;
}) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('accounts')
    .select('id, email, display_name, last_synced_at')
    .eq('domain', 'personal')
    .eq('enabled', true)
    .order('display_name', { nullsFirst: false });

  const mailboxes = (data ?? []) as Mailbox[];

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

  return (
    <section className="ix-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
          Connected mailboxes
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {mailboxes.map(m => (
          <MailboxPill key={m.id} m={m} active={selected === m.id} basePath={basePath} />
        ))}
      </div>
    </section>
  );
}

function MailboxPill({
  m, active, basePath,
}: {
  m: Mailbox; active: boolean; basePath: string;
}) {
  const href = `${basePath}?account=${m.id}`;
  const status = computeStatus(m.last_synced_at);
  const dotClass =
    status === 'healthy' ? 'bg-emerald-500' :
    status === 'stale'   ? 'bg-amber-500' :
                           'bg-rose-500';
  const tooltip = m.last_synced_at
    ? `Last sync: ${fmtCairoDateTime(m.last_synced_at)}`
    : 'Never synced';

  return (
    <Link
      href={href}
      title={`${m.email} — ${tooltip}`}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition ${
        active
          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} title={`Status: ${status}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold truncate ${active ? '' : 'text-slate-900 dark:text-slate-50'}`}>
          {m.display_name ?? m.email.split('@')[0].toUpperCase()}
        </div>
        <div className={`text-[10px] truncate font-mono ${active ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>
          {m.email}
        </div>
        <div className={`text-[10px] mt-0.5 ${active ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>
          {formatRelative(m.last_synced_at)}
        </div>
      </div>
    </Link>
  );
}

function computeStatus(iso: string | null): 'healthy' | 'stale' | 'cold' {
  if (!iso) return 'cold';
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < STALE_GREEN_MS) return 'healthy';
  if (ageMs < STALE_AMBER_MS) return 'stale';
  return 'cold';
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
