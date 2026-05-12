import 'server-only';
import { supabaseAdmin } from '../supabase';
import {
  BEITHADY_LISTINGS,
  canonicalBuildingFromTag,
  getListingByGuestyId,
} from '../rules/beithady-listings';
import { fetchMtlParentIds } from '../beithady/mtl';
import type { BuildingCode } from './types';
import { BUILDING_CODES } from './types';

// Physical sub-unit count per building. The denominator for occupancy %.
// BH-73 has parent listings + sub-units; we count sub-units (29), not
// parent listings (8). Same for any other multi-unit-strategy building.
//
// Source of truth = `guesty_listings` table (queried at build time so we
// stay current with Guesty changes), with the static catalog as fallback.
//
// Returns counts for the 4 named buildings + 'OTHER' bucket. Inactive
// listings (active=false in Guesty) are excluded.

type BuildingInventory = {
  total_units: number;
  // Listing IDs that count as physical (occupiable) units. Used elsewhere
  // to filter reservations to "real" units only.
  physical_listing_ids: string[];
};

export type AllInventories = Record<BuildingCode, BuildingInventory> & {
  total_all: number;                 // total across all buildings (including OTHER)
  physical_listing_ids_all: string[];
};

export function bucketBuildingHelper(rawBuilding: string | null | undefined): BuildingCode {
  if (!rawBuilding) return 'OTHER';
  const code = canonicalBuildingFromTag(rawBuilding);
  if (
    code === 'BH-26' ||
    code === 'BH-73' ||
    code === 'BH-435' ||
    code === 'BH-OK'
  ) {
    return code as BuildingCode;
  }
  return 'OTHER';
}

// Per user's standing rule (2026-04-30): UAE units (BH-DXB) are
// EXCLUDED from every report aggregation — revenue, occupancy,
// check-in/out counts, MTD, etc. They remain visible in messaging
// and calendar surfaces, but never count toward Beit Hady totals.
// This predicate centralizes the test so callers don't drift.
export function isExcludedFromReport(rawBuilding: string | null | undefined): boolean {
  if (!rawBuilding) return false;
  const code = canonicalBuildingFromTag(rawBuilding).toUpperCase();
  return code === 'DXB' || code === 'BH-DXB' || code === 'AE' || code === 'UAE';
}

/**
 * Determine "physical sub-unit" listings. In Guesty's Multi-Unit Strategy:
 *   listingType='MTL' → parent (NOT a physical unit, do not count)
 *   listingType='SLT' → sub-listing (a physical unit)
 *   listingType='SINGLE' → standalone single physical unit
 *   listingType=null → fall back to catalog (the static `BEITHADY_LISTINGS`
 *     catalog has the authoritative `unit_type`; we exclude MULTI-UNIT
 *     parents since their sub-units already count separately).
 *
 * Field-level reality check: Guesty's `listingType` is NOT in the schema
 * we sync from `/v1/listings` for many tenants — confirmed via SQL that
 * all 36 BH-73 listings have `listing_type=null`. The catalog fallback
 * is therefore essential, not optional.
 *
 * Inactive listings (active=false) are excluded.
 */
function isPhysicalUnit(
  row: {
    id?: string;
    listing_type: string | null;
    active: boolean | null;
    nickname?: string | null;
    master_listing_id?: string | null;
  },
  mtlParentIds: Set<string>,
): boolean {
  if (row.active === false) return false;

  // Primary signal (post migration 0042): master_listing_id is the
  // populated MTL parent reference. If this row IS a parent (some other
  // row points to its id), it's not bookable.
  if (row.id && mtlParentIds.has(row.id)) return false;
  // If it has a parent of its own, it's a child → bookable.
  if (row.master_listing_id) return true;

  // Fallback signals (still useful when Guesty actually populates
  // listing_type or for legacy rows the backfill hasn't touched yet).
  const t = (row.listing_type || '').toUpperCase();
  if (t === 'MTL') return false;
  if (t === 'SLT' || t === 'SINGLE') return true;

  if (row.id) {
    const cat = getListingByGuestyId(row.id);
    if (cat) {
      if (cat.unit_type === 'MULTI-UNIT') return false;
      return true;
    }
  }
  // Standalone with no signals → treat as bookable.
  return true;
}

/**
 * Build the per-building inventory from `guesty_listings`. Used both for
 * occupancy denominators and for filtering reservation queries to physical
 * units only. Falls back to the static catalog if the Guesty mirror is
 * empty (shouldn't happen post-Phase 9 sync).
 */
export async function loadBuildingInventories(): Promise<AllInventories> {
  const sb = supabaseAdmin();
  const [{ data }, mtlParentIds] = await Promise.all([
    sb
      .from('guesty_listings')
      .select('id, building_code, listing_type, master_listing_id, active, nickname'),
    fetchMtlParentIds(),
  ]);
  const rows = (data || []) as Array<{
    id: string;
    building_code: string | null;
    listing_type: string | null;
    master_listing_id: string | null;
    active: boolean | null;
    nickname: string | null;
  }>;

  const out: AllInventories = {
    'BH-26': { total_units: 0, physical_listing_ids: [] },
    'BH-73': { total_units: 0, physical_listing_ids: [] },
    'BH-435': { total_units: 0, physical_listing_ids: [] },
    'BH-OK': { total_units: 0, physical_listing_ids: [] },
    OTHER: { total_units: 0, physical_listing_ids: [] },
    total_all: 0,
    physical_listing_ids_all: [],
  };

  if (rows.length === 0) {
    // Fallback to static catalog (excludes MULTI-UNIT parents).
    for (const l of BEITHADY_LISTINGS) {
      if (l.unit_type === 'MULTI-UNIT') continue;
      const bucket = bucketBuildingHelper(l.building_tag);
      out[bucket].total_units += 1;
      out[bucket].physical_listing_ids.push(l.guesty_listing_id);
      out.total_all += 1;
      out.physical_listing_ids_all.push(l.guesty_listing_id);
    }
    return out;
  }

  for (const r of rows) {
    if (!isPhysicalUnit({
      id: r.id,
      listing_type: r.listing_type,
      active: r.active,
      nickname: r.nickname,
      master_listing_id: r.master_listing_id,
    }, mtlParentIds)) continue;
    // Prefer Guesty's building_code; fall back to the catalog match.
    const bcRaw =
      r.building_code ||
      getListingByGuestyId(r.id)?.building_tag ||
      null;
    // BH-DXB exclusion (2026-05-04): UAE units must not count toward
    // Beit Hady inventory totals. Skip entirely so they don't pollute
    // physical_listing_ids_all (= the filter used to scope all
    // downstream report queries to "real BH inventory").
    if (isExcludedFromReport(bcRaw)) continue;
    const bucket = bucketBuildingHelper(bcRaw);
    out[bucket].total_units += 1;
    out[bucket].physical_listing_ids.push(r.id);
    out.total_all += 1;
    out.physical_listing_ids_all.push(r.id);
  }

  return out;
}

/**
 * For occupancy and other denom-driven metrics, returns the list of
 * BuildingCode keys we always emit (in display order).
 */
export function buildingOrder(): readonly BuildingCode[] {
  return BUILDING_CODES;
}

/**
 * Helper: bucket a Guesty listing row into one of the BuildingCodes.
 */
export function bucketFromGuestyListing(row: {
  building_code: string | null;
  id?: string;
}): BuildingCode {
  const fromBc = bucketBuildingHelper(row.building_code);
  if (fromBc !== 'OTHER') return fromBc;
  if (row.id) {
    const cat = getListingByGuestyId(row.id);
    if (cat) return bucketBuildingHelper(cat.building_tag);
  }
  return 'OTHER';
}

export type DxbInventory = {
  total_units: number;
  physical_listing_ids: string[];
};

export type AllInventoriesWithDxb = {
  egypt: AllInventories;
  dxb: DxbInventory;
};

/**
 * v3 (2026-05-12): partitioned inventory loader. Egypt half is identical
 * to `loadBuildingInventories()` (same filter logic, same physical-unit
 * detection, same fallback). DXB half is a single flat bucket containing
 * all active DXB listings.
 *
 * Reuses the same query — no extra DB round-trip.
 */
export async function loadAllInventoriesWithDxb(): Promise<AllInventoriesWithDxb> {
  const sb = supabaseAdmin();
  const [{ data }, mtlParentIds] = await Promise.all([
    sb
      .from('guesty_listings')
      .select('id, building_code, listing_type, master_listing_id, active, nickname'),
    fetchMtlParentIds(),
  ]);
  const rows = (data || []) as Array<{
    id: string;
    building_code: string | null;
    listing_type: string | null;
    master_listing_id: string | null;
    active: boolean | null;
    nickname: string | null;
  }>;

  const egypt: AllInventories = {
    'BH-26': { total_units: 0, physical_listing_ids: [] },
    'BH-73': { total_units: 0, physical_listing_ids: [] },
    'BH-435': { total_units: 0, physical_listing_ids: [] },
    'BH-OK': { total_units: 0, physical_listing_ids: [] },
    OTHER: { total_units: 0, physical_listing_ids: [] },
    total_all: 0,
    physical_listing_ids_all: [],
  };
  const dxb: DxbInventory = {
    total_units: 0,
    physical_listing_ids: [],
  };

  if (rows.length === 0) {
    // Catalog fallback. DXB catalog rows are tagged so check there too.
    for (const l of BEITHADY_LISTINGS) {
      if (l.unit_type === 'MULTI-UNIT') continue;
      const bcRaw = l.building_tag;
      if (isExcludedFromReport(bcRaw)) {
        dxb.total_units += 1;
        dxb.physical_listing_ids.push(l.guesty_listing_id);
        continue;
      }
      const bucket = bucketBuildingHelper(bcRaw);
      egypt[bucket].total_units += 1;
      egypt[bucket].physical_listing_ids.push(l.guesty_listing_id);
      egypt.total_all += 1;
      egypt.physical_listing_ids_all.push(l.guesty_listing_id);
    }
    return { egypt, dxb };
  }

  for (const r of rows) {
    if (!isPhysicalUnit({
      id: r.id,
      listing_type: r.listing_type,
      active: r.active,
      nickname: r.nickname,
      master_listing_id: r.master_listing_id,
    }, mtlParentIds)) continue;
    const bcRaw =
      r.building_code ||
      getListingByGuestyId(r.id)?.building_tag ||
      null;
    if (isExcludedFromReport(bcRaw)) {
      dxb.total_units += 1;
      dxb.physical_listing_ids.push(r.id);
      continue;
    }
    const bucket = bucketBuildingHelper(bcRaw);
    egypt[bucket].total_units += 1;
    egypt[bucket].physical_listing_ids.push(r.id);
    egypt.total_all += 1;
    egypt.physical_listing_ids_all.push(r.id);
  }

  return { egypt, dxb };
}
