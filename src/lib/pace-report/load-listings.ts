// src/lib/pace-report/load-listings.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { PaceCountry, PaceFilters } from './types';

export type PaceListing = {
  id: string;
  nickname: string;
  active: boolean;
  bedrooms: number | null;
  listing_type: string | null;          // 'SINGLE' | 'MTL' | 'SLT' | null
  master_listing_id: string | null;
  city: string | null;
  country: PaceCountry | null;
  tags: string[];
  building_code: string | null;
};

const COUNTRY_CODE_FROM_ADDRESS: Record<string, PaceCountry> = {
  // Common Guesty values for the two operating countries.
  'egypt': 'EG', 'eg': 'EG', 'arab republic of egypt': 'EG',
  'united arab emirates': 'AE', 'uae': 'AE', 'ae': 'AE',
};

function normalizeCountry(raw: string | null): PaceCountry | null {
  if (!raw) return null;
  return COUNTRY_CODE_FROM_ADDRESS[raw.trim().toLowerCase()] ?? null;
}

/**
 * Returns the set of physical (bookable) listings matching `filters`.
 * Multi-unit parents (listing_type='MTL' or referenced as
 * master_listing_id by any child) are excluded — the children are the
 * physical units.
 *
 * Why server-side: the listings table can grow into the hundreds, and
 * filtering at the DB lets us avoid pulling tags/raw blobs we don't need.
 */
export async function loadPaceListings(filters: PaceFilters): Promise<PaceListing[]> {
  const sb = supabaseAdmin();

  let q = sb
    .from('guesty_listings')
    .select('id, nickname, active, bedrooms, listing_type, master_listing_id, address_city, address_country, tags, building_code');

  if (!filters.includeInactive) {
    q = q.eq('active', true);
  }

  const { data, error } = await q;
  if (error) throw new Error(`pace_listings_query_failed: ${error.message}`);

  // Identify MTL parents (listings referenced as a master by any child).
  const parentIds = new Set<string>();
  for (const r of data || []) {
    const masterId = (r as { master_listing_id: string | null }).master_listing_id;
    if (masterId) parentIds.add(masterId);
  }

  const rows: PaceListing[] = [];
  for (const r of data || []) {
    const row = r as {
      id: string;
      nickname: string | null;
      active: boolean | null;
      bedrooms: number | null;
      listing_type: string | null;
      master_listing_id: string | null;
      address_city: string | null;
      address_country: string | null;
      tags: string[] | null;
      building_code: string | null;
    };
    // Skip MTL parents.
    if (parentIds.has(row.id)) continue;
    if ((row.listing_type || '').toUpperCase() === 'MTL') continue;

    const country = normalizeCountry(row.address_country);
    const city = (row.address_city || '').trim() || null;
    const tags = row.tags || [];

    // Filter application
    if (filters.countries.length > 0 && (!country || !filters.countries.includes(country))) continue;
    if (filters.cities.length > 0 && (!city || !filters.cities.includes(city))) continue;
    if (filters.tags.length > 0 && !filters.tags.some((t) => tags.includes(t))) continue;
    if (filters.listingIds.length > 0 && !filters.listingIds.includes(row.id)) continue;

    rows.push({
      id: row.id,
      nickname: row.nickname || row.id,
      active: row.active ?? false,
      bedrooms: row.bedrooms,
      listing_type: row.listing_type,
      master_listing_id: row.master_listing_id,
      city,
      country,
      tags,
      building_code: row.building_code,
    });
  }

  return rows;
}

/** Stable display-name for "Single Unit" / "Multi Unit" — used by per-property table. */
export function unitTypeLabel(listing: PaceListing): 'Single Unit' | 'Multi Unit' {
  if ((listing.listing_type || '').toUpperCase() === 'SLT') return 'Multi Unit';
  if (listing.master_listing_id) return 'Multi Unit';
  return 'Single Unit';
}