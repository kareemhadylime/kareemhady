// Canonical "what is a bookable physical unit?" resolver.
//
// Why this exists:
//   guesty_listings has 87 active rows for our portfolio, but only ~79 are
//   distinct bookable physical inventory. The 8 extra are MTL parents — these
//   represent the same physical apartments as their SLT children (calendar
//   shared; can't double-book). For any audit or rate-card report, double-
//   counting them inflates totals and causes confusing "duplicate listings"
//   warnings.
//
// This module is the single source of truth for "give me the listings I should
// audit / sync / report against". Every fees-audit, daily-rate sync, and
// listing-terms sync goes through here so the math is consistent.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type BookableListing = {
  id: string;
  nickname: string | null;
  building_code: string | null;
  bedrooms: number | null;
  accommodates: number | null;
  master_listing_id: string | null;     // null = standalone or MTL parent
  is_mtl_parent: boolean;               // true = has children, virtual umbrella
  is_slt_child: boolean;                // true = master_listing_id IS NOT NULL
  is_standalone: boolean;               // true = no children, no parent
};

export type BookableListingsResult = {
  listings: BookableListing[];          // deduped: standalone + SLT children only
  total_active: number;                 // raw active count (incl. parents)
  physical_units: number;               // listings.length
  mtl_parents_excluded: number;
  by_building: Record<string, number>;
};

/**
 * Returns the canonical "physical bookable units" list:
 *   - active = true
 *   - PLUS standalone listings (no master, no children)
 *   - PLUS SLT children (master_listing_id IS NOT NULL)
 *   - MINUS MTL parents (id IS in any other row's master_listing_id)
 *
 * The MTL parent and its SLT children share the SAME physical inventory and
 * the SAME calendar in Guesty. Counting both = double-count.
 */
export async function getBookableListings(opts: {
  buildings?: string[];                 // optional building filter (post-fetch)
  includeMtlParents?: boolean;          // default false
} = {}): Promise<BookableListingsResult> {
  const sb = supabaseAdmin();

  // Pull all active listings + their master refs in one round trip.
  const { data: rawAll, error } = await sb
    .from('guesty_listings')
    .select('id, nickname, building_code, bedrooms, accommodates, master_listing_id, active')
    .eq('active', true);

  if (error) throw new Error(`bookable-listings fetch failed: ${error.message}`);

  type Row = {
    id: string;
    nickname: string | null;
    building_code: string | null;
    bedrooms: number | null;
    accommodates: number | null;
    master_listing_id: string | null;
    active: boolean | null;
  };
  const all = (rawAll as Row[] | null) || [];

  // Build the set of listing-ids that ARE master_listing_ids of other rows.
  // Those are MTL parents.
  const parentIds = new Set<string>();
  for (const r of all) {
    if (r.master_listing_id) parentIds.add(r.master_listing_id);
  }

  let mtlParentsExcluded = 0;
  const out: BookableListing[] = [];
  for (const r of all) {
    const isMtlParent = parentIds.has(r.id);
    const isSltChild = r.master_listing_id !== null && r.master_listing_id !== '';
    const isStandalone = !isMtlParent && !isSltChild;

    if (isMtlParent && !opts.includeMtlParents) {
      mtlParentsExcluded += 1;
      continue;
    }

    out.push({
      id: r.id,
      nickname: r.nickname,
      building_code: r.building_code,
      bedrooms: r.bedrooms,
      accommodates: r.accommodates,
      master_listing_id: r.master_listing_id,
      is_mtl_parent: isMtlParent,
      is_slt_child: isSltChild,
      is_standalone: isStandalone,
    });
  }

  // Normalize building codes to the canonical BH-DXB / OTHER buckets so
  // the building filter matches even when the DB stores legacy codes
  // (e.g. 'DXB' without prefix for Dubai listings).
  function normalizeBuilding(code: string | null | undefined): string {
    if (!code) return 'OTHER';
    if (code === 'BH-26' || code === 'BH-73' || code === 'BH-435' || code === 'BH-OK' || code === 'BH-DXB') return code;
    if (code === 'DXB' || code === 'BH_DXB' || code.toUpperCase() === 'DXB') return 'BH-DXB';
    return 'OTHER';
  }

  let filtered = out;
  if (opts.buildings && opts.buildings.length) {
    const allowed = new Set(opts.buildings);
    filtered = filtered.filter(l => allowed.has(normalizeBuilding(l.building_code)));
  }

  const byBuilding: Record<string, number> = {};
  for (const l of filtered) {
    const k = normalizeBuilding(l.building_code);
    byBuilding[k] = (byBuilding[k] || 0) + 1;
  }

  return {
    listings: filtered,
    total_active: all.length,
    physical_units: filtered.length,
    mtl_parents_excluded: mtlParentsExcluded,
    by_building: byBuilding,
  };
}

/**
 * Lightweight version returning just the IDs — useful for sync jobs that
 * only need the list to iterate over.
 */
export async function getBookableListingIds(opts: {
  buildings?: string[];
  includeMtlParents?: boolean;
} = {}): Promise<string[]> {
  const r = await getBookableListings(opts);
  return r.listings.map(l => l.id);
}
