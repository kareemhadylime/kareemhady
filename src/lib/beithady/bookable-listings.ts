// Canonical "what is a bookable physical unit?" resolver.
//
// Why this exists:
//   guesty_listings has 87 active rows for our portfolio. Most are standalone
//   listings. BH-73 also has 8 MTL (multi-unit) parent listings that bundle
//   23 SLT child listings — the parent represents the building/apartment when
//   rented as a single party, the children are the individual rooms inside.
//
// Operator's rule (2026-05-11):
//   "Show the main multi-units & single units, no need to see the child units
//    — they will have the same info."
//
// So the canonical bookable set is now:
//   - Standalone listings (no parent, no children)
//   - MTL parents (the umbrella listing for a multi-unit apartment)
//   - NOT SLT children (master_listing_id IS NOT NULL — they're rooms within
//     a parent and double-count the same physical inventory)
//
// Previous convention was the opposite (kept children, dropped parents). That
// caused BH-73 to render 28 rows (5 standalones + 23 children) with most
// children missing PriceLabs data because PriceLabs tracks the parent.
//
// Every fees-audit, daily-rate sync, and listing-terms sync goes through
// here so the math is consistent.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type BookableListing = {
  id: string;
  nickname: string | null;
  building_code: string | null;
  bedrooms: number | null;
  accommodates: number | null;
  master_listing_id: string | null;     // null = standalone or MTL parent
  is_mtl_parent: boolean;               // true = has children
  is_slt_child: boolean;                // true = master_listing_id IS NOT NULL
  is_standalone: boolean;               // true = no children, no parent
};

export type BookableListingsResult = {
  listings: BookableListing[];          // standalones + MTL parents (no children)
  total_active: number;                 // raw active count (incl. all roles)
  physical_units: number;               // listings.length
  /** Was `mtl_parents_excluded` pre-2026-05-11; renamed to reflect the new
   *  rule. Number of SLT child listings dropped from the canonical set. */
  slt_children_excluded: number;
  by_building: Record<string, number>;
};

/**
 * Returns the canonical "physical bookable units" list:
 *   - active = true
 *   - PLUS standalone listings (no master, no children)
 *   - PLUS MTL parents (id IS in any other row's master_listing_id)
 *   - MINUS SLT children (master_listing_id IS NOT NULL)
 *
 * The MTL parent and its SLT children share the SAME physical inventory and
 * the SAME calendar in Guesty. Counting both = double-count. Per operator's
 * 2026-05-11 instruction, the parent (the apartment as a whole) is the
 * reportable unit, not the individual rooms.
 */
export async function getBookableListings(opts: {
  buildings?: string[];                 // optional building filter (post-fetch)
  /** @deprecated The default already includes MTL parents. Kept for API
   *  compatibility; ignored at runtime. */
  includeMtlParents?: boolean;
  /** Set to true to keep SLT children in the result (rarely needed —
   *  per-room operational views like cleaning-list might want them). */
  includeSltChildren?: boolean;
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

  let sltChildrenExcluded = 0;
  const out: BookableListing[] = [];
  for (const r of all) {
    const isMtlParent = parentIds.has(r.id);
    const isSltChild = r.master_listing_id !== null && r.master_listing_id !== '';
    const isStandalone = !isMtlParent && !isSltChild;

    if (isSltChild && !opts.includeSltChildren) {
      sltChildrenExcluded += 1;
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
    slt_children_excluded: sltChildrenExcluded,
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
  includeSltChildren?: boolean;
} = {}): Promise<string[]> {
  const r = await getBookableListings(opts);
  return r.listings.map(l => l.id);
}
