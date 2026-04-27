// Late-reply SLA color coding per Plan v0.3 §C.4. Green ≤1h, Yellow 1-4h,
// Orange 4-12h, Red >12h since guest's last message with no reply yet.
// `none` means there's no open inbound (we replied last) — no SLA.

export type SlaBucket = 'green' | 'yellow' | 'orange' | 'red' | 'none' | null;

export const SLA_BUCKET_LABELS: Record<NonNullable<SlaBucket>, string> = {
  green: '≤ 1h',
  yellow: '1–4h',
  orange: '4–12h',
  red: '> 12h',
  none: 'replied',
};

export const SLA_BUCKET_CLASSES: Record<NonNullable<SlaBucket>, string> = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  none: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export const SLA_BUCKET_DOT: Record<NonNullable<SlaBucket>, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-rose-500',
  none: 'bg-slate-400',
};

export function formatAge(seconds: number | null): string {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
