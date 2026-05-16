import 'server-only';

// Type exports (full builder implementation comes in Task 2).

export type PickerScope = 'all' | 'older_than_7d' | 'older_than_14d' | 'this_week';

export type PickerOrderLine = {
  qty: number;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
};

export type PickerOrder = {
  id: number;
  name: string;
  customer_name: string | null;
  email: string | null;
  created_at: string | null;
  age_days: number | null;
  remaining_line_count: number;
  remaining_unit_count: number;
  lines: PickerOrderLine[];
};

export type PickerBucket = {
  key: 1 | 2 | 3 | 4;
  label: string;
  orders: PickerOrder[];
  total_orders: number;
  total_units: number;
  oldest_age_days: number | null;
};

export type PickerCommonVariant = {
  variant_id: number | null;
  variant_title: string | null;
  sku: string | null;
  orders: number;
  units: number;
};

export type PickerCommonItem = {
  product_id: number;
  product_title: string;
  short_description: string | null;
  image_url: string | null;
  variants: PickerCommonVariant[];
  total_orders: number;
  total_units: number;
};

export type PickerReport = {
  scope: PickerScope;
  scope_label: string;
  generated_at: string;
  totals: {
    open_orders: number;
    total_lines: number;
    total_units: number;
    oldest_age_days: number | null;
  };
  buckets: PickerBucket[];
  common_items: PickerCommonItem[];
};

// ----- Pure helpers -----

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Cairo wall-clock date+weekday at the given instant. */
function cairoLocalParts(now: Date): {
  year: number;
  month: number;
  day: number;
  weekday: string; // 'Mon' | 'Tue' | …
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
  };
}

/** Cairo UTC offset at the given instant, as an ISO suffix like '+02:00' or '+03:00'. */
function cairoOffsetSuffix(at: Date): string {
  const tz = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find(p => p.type === 'timeZoneName')?.value;
  // tz is like 'GMT+03:00' or 'GMT+02:00'. Fall back to +02:00 (EET) if Intl
  // ever fails to produce it (shouldn't happen on any modern runtime).
  return tz ? tz.replace('GMT', '') : '+02:00';
}

/** ISO timestamp for Cairo-local Monday 00:00 of the week containing `now`. */
function cairoMondayIso(now: Date): string {
  const { year, month, day, weekday } = cairoLocalParts(now);
  const WEEKDAY_INDEX: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const daysSinceMonday = WEEKDAY_INDEX[weekday];
  if (daysSinceMonday === undefined) {
    throw new Error(`cairoMondayIso: unrecognized weekday abbreviation "${weekday}"`);
  }
  // Build the Monday date in UTC space first (purely arithmetic).
  const mondayUtc = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  const isoDate = `${mondayUtc.getUTCFullYear()}-${pad(mondayUtc.getUTCMonth() + 1)}-${pad(mondayUtc.getUTCDate())}`;
  // Use midday Cairo on that Monday to ask Intl for the correct offset
  // (avoids any DST-transition ambiguity at 00:00 itself).
  const offset = cairoOffsetSuffix(new Date(`${isoDate}T12:00:00Z`));
  return `${isoDate}T00:00:00${offset}`;
}

/** Resolves a scope choice to ISO timestamp bounds and a human label.
 * - `all`: no bounds
 * - `older_than_7d` / `older_than_14d`: orders created strictly before (now − N days)
 * - `this_week`: orders created on or after Cairo-local Monday 00:00
 * All non-null bounds are full ISO timestamps (with `Z` for UTC or `±HH:MM`
 * for Cairo), so consumers can pass them directly to Supabase comparisons.
 */
export function resolveScope(
  scope: PickerScope,
  now: Date
): { fromDate: string | null; toDate: string | null; label: string } {
  switch (scope) {
    case 'older_than_7d': {
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      return { fromDate: null, toDate: cutoff.toISOString(), label: 'Older than 7 days' };
    }
    case 'older_than_14d': {
      const cutoff = new Date(now.getTime() - 14 * 86_400_000);
      return { fromDate: null, toDate: cutoff.toISOString(), label: 'Older than 14 days' };
    }
    case 'this_week':
      return { fromDate: cairoMondayIso(now), toDate: null, label: 'This week' };
    case 'all':
    default:
      return { fromDate: null, toDate: null, label: 'All open backlog' };
  }
}

/** Maps a remaining-line-count to its bucket key. Clamps to [1, 4]. */
export function bucketKey(remainingLineCount: number): 1 | 2 | 3 | 4 {
  if (remainingLineCount <= 1) return 1;
  if (remainingLineCount === 2) return 2;
  if (remainingLineCount === 3) return 3;
  return 4;
}

/** Remaining qty for a line item after subtracting already-fulfilled qty.
 * Clamped to ≥ 0 (defensive against over-fulfillment data drift). */
export function netRemaining(quantity: number, alreadyFulfilled: number): number {
  const remaining = quantity - alreadyFulfilled;
  return remaining > 0 ? remaining : 0;
}

// Silence unused-import lint in this stub file. (Removed when Task 2 adds the
// builder body.)
export { ISO_DATE_RE };
