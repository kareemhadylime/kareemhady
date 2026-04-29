import Link from 'next/link';

// Clickable stat tile for inbox dashboards. Each tile filters the
// inbox to its bucket via URL params. Active state highlights the
// currently-applied filter.

export type StatAccent = 'rose' | 'amber' | 'yellow' | 'emerald' | undefined;

const ACCENT_CLS: Record<NonNullable<StatAccent>, string> = {
  rose: 'text-rose-700 dark:text-rose-300',
  amber: 'text-amber-700 dark:text-amber-300',
  yellow: 'text-yellow-700 dark:text-yellow-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
};

const ACCENT_BORDER_ACTIVE: Record<NonNullable<StatAccent>, string> = {
  rose: 'border-rose-400 dark:border-rose-600 bg-rose-50/40 dark:bg-rose-950/30',
  amber: 'border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/30',
  yellow: 'border-yellow-400 dark:border-yellow-600 bg-yellow-50/40 dark:bg-yellow-950/30',
  emerald: 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30',
};

export function StatLink({
  label,
  value,
  href,
  active,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
  accent?: StatAccent;
}) {
  const valueCls = accent ? ACCENT_CLS[accent] : 'text-slate-800 dark:text-slate-100';
  const activeCls = active
    ? (accent ? ACCENT_BORDER_ACTIVE[accent] : 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/40')
    : '';
  return (
    <Link
      href={href}
      className={`ix-card p-3 text-center hover:shadow-md transition border-2 ${activeCls}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${valueCls}`}>{value.toLocaleString()}</div>
    </Link>
  );
}

// Build the href for a given stat tile while preserving the current
// non-conflicting query params (search / channel / etc.).
export function buildStatHref(
  basePath: string,
  currentSp: Record<string, string | undefined>,
  apply: { sla?: 'red' | 'orange' | 'yellow' | 'green' | 'none' | null; unread?: boolean | null; breachOnly?: boolean | null },
): string {
  const next = new URLSearchParams();
  // Carry over search + sort but clear any prior sla / unread / breach
  if (currentSp.q) next.set('q', currentSp.q);
  if (currentSp.sort) next.set('sort', currentSp.sort);
  if (currentSp.source) next.set('source', currentSp.source);
  if (currentSp.building) next.set('building', currentSp.building);
  if (apply.sla === null) next.delete('sla');
  else if (apply.sla) next.set('sla', apply.sla);
  if (apply.unread === true) next.set('unread', '1');
  if (apply.breachOnly === true) next.set('breach', '1');
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Centralised SORT options + labels (used by every inbox sort dropdown).
// Default = recent_activity per user preference (new → old).
export const VALID_SORTS = [
  'recent_activity', 'recent_inbound', 'recent_outbound', 'sla_oldest', 'sla_newest', 'name_asc',
] as const;
export type ValidSort = typeof VALID_SORTS[number];
export const SORT_LABELS: Record<ValidSort, string> = {
  recent_activity: 'Newest first (default)',
  recent_inbound: 'Most recent guest message',
  recent_outbound: 'Most recently replied',
  sla_oldest: 'Oldest unanswered first',
  sla_newest: 'Newest unanswered first',
  name_asc: 'Guest name A→Z',
};
