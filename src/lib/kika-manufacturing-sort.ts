// Shared sort logic for the Manufacturing report. Lives outside
// `kika-manufacturing.ts` (which carries `import 'server-only'`) so the
// client drill-down and the PDF API route can both import the same helper
// without server-only leaking into the client bundle.

import type { ManufacturingRow } from './kika-manufacturing';

export type ManufacturingSortKey =
  | 'product'
  | 'variant'
  | 'sku'
  | 'open_qty'
  | 'in_stock'
  | 'net_to_make'
  | 'order_count'
  | 'oldest_age_days';

export type ManufacturingSortDir = 'asc' | 'desc';

const VALID_KEYS: ManufacturingSortKey[] = [
  'product',
  'variant',
  'sku',
  'open_qty',
  'in_stock',
  'net_to_make',
  'order_count',
  'oldest_age_days',
];

export function isManufacturingSortKey(v: string | null | undefined): v is ManufacturingSortKey {
  return !!v && (VALID_KEYS as string[]).includes(v);
}

export function isManufacturingSortDir(v: string | null | undefined): v is ManufacturingSortDir {
  return v === 'asc' || v === 'desc';
}

/** Sort manufacturing rows in place-safe fashion (returns a new array).
 * Mirrors the on-screen comparator exactly so the PDF can preserve the
 * user's chosen sort. */
export function sortManufacturingRows(
  rows: ManufacturingRow[],
  sortKey: ManufacturingSortKey,
  sortDir: ManufacturingSortDir
): ManufacturingRow[] {
  const copy = [...rows];
  const dir = sortDir === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    switch (sortKey) {
      case 'product':
        return a.product_title.localeCompare(b.product_title) * dir;
      case 'variant':
        return (a.variant_title || '').localeCompare(b.variant_title || '') * dir;
      case 'sku':
        return (a.sku || '').localeCompare(b.sku || '') * dir;
      case 'open_qty':
        return (a.open_qty - b.open_qty) * dir;
      case 'in_stock':
        return (a.in_stock - b.in_stock) * dir;
      case 'net_to_make':
        return (a.net_to_make - b.net_to_make) * dir;
      case 'order_count':
        return (a.order_count - b.order_count) * dir;
      case 'oldest_age_days':
        return ((a.oldest_age_days ?? -1) - (b.oldest_age_days ?? -1)) * dir;
      default:
        return 0;
    }
  });
  return copy;
}
