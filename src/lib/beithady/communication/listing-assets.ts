import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Phase Q.3 — listing asset library reads.
// Used by the LibraryPicker component on the inbox composer + admin page.

export type ListingAsset = {
  id: string;
  listing_id: string;
  category: 'photo' | 'wifi_card' | 'gate_diagram' | 'parking_diagram' | 'checklist';
  storage_path: string;
  public_url: string;
  caption: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
};

export type BuildingAssetSummary = {
  building_code: string;
  listing_count: number;
  asset_count: number;
};

export type ListingAssetSummary = {
  listing_id: string;
  nickname: string | null;
  building_code: string | null;
  asset_count: number;
};

// Buildings + per-building counts (drives the first step of the picker).
export async function getAssetBuildingsSummary(): Promise<BuildingAssetSummary[]> {
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_listing_assets')
    .select('listing_id, guesty_listings!inner(building_code)')
    .limit(50_000);
  type Row = { listing_id: string; guesty_listings: { building_code: string | null } };
  const tally = new Map<string, { listings: Set<string>; count: number }>();
  for (const r of (rows as unknown as Row[] | null) || []) {
    const b = r.guesty_listings?.building_code;
    if (!b) continue;
    if (!tally.has(b)) tally.set(b, { listings: new Set(), count: 0 });
    tally.get(b)!.listings.add(r.listing_id);
    tally.get(b)!.count += 1;
  }
  return Array.from(tally.entries())
    .map(([building_code, v]) => ({ building_code, listing_count: v.listings.size, asset_count: v.count }))
    .sort((a, b) => a.building_code.localeCompare(b.building_code));
}

// Listings within a building, with per-listing asset count.
export async function getListingsInBuildingWithAssets(buildingCode: string): Promise<ListingAssetSummary[]> {
  const sb = supabaseAdmin();
  const { data: listings } = await sb
    .from('guesty_listings')
    .select('id, nickname, building_code')
    .eq('building_code', buildingCode)
    .eq('active', true)
    .order('nickname', { ascending: true });
  const ids = ((listings as Array<{ id: string }> | null) || []).map(l => l.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: assetRows } = await sb
      .from('beithady_listing_assets')
      .select('listing_id')
      .in('listing_id', ids)
      .limit(50_000);
    for (const r of (assetRows as Array<{ listing_id: string }> | null) || []) {
      counts.set(r.listing_id, (counts.get(r.listing_id) || 0) + 1);
    }
  }
  return ((listings as Array<{ id: string; nickname: string | null; building_code: string | null }> | null) || [])
    .map(l => ({
      listing_id: l.id,
      nickname: l.nickname,
      building_code: l.building_code,
      asset_count: counts.get(l.id) || 0,
    }));
}

export async function getListingAssets(listingId: string): Promise<ListingAsset[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_listing_assets')
    .select('*')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(200);
  return (data as ListingAsset[] | null) || [];
}
