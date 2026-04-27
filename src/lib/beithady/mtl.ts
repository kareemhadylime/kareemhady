// Beithady MTL (multi-unit listing) polarity helpers.
//
// Background: Guesty supports an MTL structure where one parent
// listing groups several sub-unit children. The parent is an aggregate
// (not bookable on its own); children are the actual rentable rooms.
// Today, Guesty's masterListingId field comes back NULL for every
// Beithady listing — the hierarchy is encoded only in nicknames
// (parent: `BH73-3BR-SB-1`, children: `BH73-3BR-SB-1-001`, `-101`, …).
//
// Migration 0042 + the run-guesty-sync `beithady_backfill_mtl_master_id`
// RPC populate `master_listing_id` from that nickname convention so
// every domain query can use one of the simple SQL filters below.
//
// Polarity matrix:
//   Gallery / Documents / Ads creative / Pre-arrival templates
//     → use AGGREGATES filter (parents + standalones; children share
//       pictures + features with the parent so a single upload covers
//       every child)
//   CRM / Communication / Calendar / Daily report / Pipeline
//     → use ATOMS filter (children + standalones; parents are not
//       bookable so they don't appear in reservations / occupancy /
//       financial roll-ups)

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

/** SQL filter snippet for use with `or()` / `filter()` — picks rows
 *  that are MTL parents or standalones (no parent of their own).
 *  Equivalent to `WHERE master_listing_id IS NULL`. */
export const MTL_AGGREGATES_FILTER = 'master_listing_id.is.null';

/** Returns a Set of listing ids that are MTL parents (have at least
 *  one child pointing at them via master_listing_id). Use this when
 *  you need "drop parents" semantics — call .has(id) per row. */
export async function fetchMtlParentIds(): Promise<Set<string>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('guesty_listings')
    .select('master_listing_id')
    .not('master_listing_id', 'is', null)
    .eq('active', true);
  const ids = new Set<string>();
  for (const r of (data as Array<{ master_listing_id: string | null }> | null) || []) {
    if (r.master_listing_id) ids.add(r.master_listing_id);
  }
  return ids;
}

/** True when the row is a "bookable atom" — a child of an MTL parent
 *  or a standalone listing (no children pointing at it). False when
 *  the row IS an MTL parent. */
export function isBookableAtom(
  row: { id: string; master_listing_id: string | null },
  parentIds: Set<string>,
): boolean {
  if (row.master_listing_id) return true; // MTL child
  return !parentIds.has(row.id); // standalone unless something points to me
}
