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

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Resolves a scope choice to date bounds and a human label.
 * - `all`: no date filter
 * - `older_than_7d`: orders created strictly before (now − 7 days)
 * - `older_than_14d`: orders created strictly before (now − 14 days)
 * - `this_week`: orders created on or after the most recent Monday (UTC)
 * Returns dates as YYYY-MM-DD strings so the Supabase query can use them
 * directly without re-formatting.
 */
export function resolveScope(
  scope: PickerScope,
  now: Date
): { fromDate: string | null; toDate?: string | null; label: string } {
  switch (scope) {
    case 'older_than_7d': {
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      return { fromDate: null, toDate: toIsoDate(cutoff), label: 'Older than 7 days' };
    }
    case 'older_than_14d': {
      const cutoff = new Date(now.getTime() - 14 * 86_400_000);
      return { fromDate: null, toDate: toIsoDate(cutoff), label: 'Older than 14 days' };
    }
    case 'this_week': {
      // ISO week: Monday is day 1, Sunday is day 7. JS getUTCDay() returns
      // 0 for Sunday … 6 for Saturday. Shift so Monday = 0.
      const dow = now.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7;
      const monday = new Date(now.getTime() - daysSinceMonday * 86_400_000);
      return { fromDate: toIsoDate(monday), toDate: null, label: 'This week' };
    }
    case 'all':
    default:
      return { fromDate: null, label: 'All open backlog' };
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
