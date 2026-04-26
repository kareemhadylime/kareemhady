import 'server-only';
import { supabaseAdmin } from '../supabase';
import {
  BEITHADY_LISTINGS,
  canonicalBuildingFromTag,
  getListingByGuestyId,
} from '../rules/beithady-listings';
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

function bucketBuilding(rawBuilding: string | null | undefined): BuildingCode {
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

/**
 * Determine "physical sub-unit" listings. In Guesty's Multi-Unit Strategy:
 *   listingType='MTL' → parent (NOT a physical unit, do not count)
 *   listingType='SLT' → sub-listing (a physical unit)
 *   listingType='SINGLE' → standalone single physical unit
 *   listingType=null → treat as SINGLE (catalog SINGLE-UNIT entries)
 *
 * Inactive listings (active=false) are excluded.
 */
function isPhysicalUnit(row: {
  listing_type: string | null;
  active: boolean | null;
}): boolean {
  if (row.active === false) return false;
  const t = (row.listing_type || '').toUpperCase();
  if (t === 'MTL') return false; // parent — its sub-units count instead
  return true; // SLT, SINGLE, or null all count
}

/**
 * Build the per-building inventory from `guesty_listings`. Used both for
 * occupancy denominators and for filtering reservation queries to physical
 * units only. Falls back to the static catalog if the Guesty mirror is
 * empty (shouldn't happen post-Phase 9 sync).
 */
export async function loadBuildingInventories(): Promise<AllInventories> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('guesty_listings')
    .select('id, building_code, listing_type, active, nickname');
  const rows = (data || []) as Array<{
    id: string;
    building_code: string | null;
    listing_type: string | null;
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
      const bucket = bucketBuilding(l.building_tag);
      out[bucket].total_units += 1;
      out[bucket].physical_listing_ids.push(l.guesty_listing_id);
      out.total_all += 1;
      out.physical_listing_ids_all.push(l.guesty_listing_id);
    }
    return out;
  }

  for (const r of rows) {
    if (!isPhysicalUnit(r)) continue;
    // Prefer Guesty's building_code; fall back to the catalog match.
    const bcRaw =
      r.building_code ||
      getListingByGuestyId(r.id)?.building_tag ||
      null;
    const bucket = bucketBuilding(bcRaw);
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
  const fromBc = bucketBuilding(row.building_code);
  if (fromBc !== 'OTHER') return fromBc;
  if (row.id) {
    const cat = getListingByGuestyId(row.id);
    if (cat) return bucketBuilding(cat.building_tag);
  }
  return 'OTHER';
}
