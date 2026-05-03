import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Listing-asset library reads. Used by the LibraryPicker component on
// the inbox composer + admin page.
//
// 2026-05 — repointed at the new gallery system:
//   beithady_gallery_assets    — current source of truth (post Gallery
//                                Overhaul, see migration 0066-gallery)
//   beithady_unit_templates    — shared photo library across identical
//                                units in the same building (e.g. all
//                                4-bedroom A-line apartments share one
//                                template). guesty_listings.unit_template_id
//                                is the FK.
//
// A listing's effective asset set is direct (`listing_id = X`) UNION
// template-shared (`unit_template_id = listings.unit_template_id`).
//
// The legacy beithady_listing_assets table is no longer queried — it
// was emptied during the gallery-overhaul migration; pre-overhaul
// references are deliberately dropped. (Past message URLs still work
// because they point at Supabase Storage public URLs directly.)

export type ListingAsset = {
  id: string;
  listing_id: string | null;        // null when sourced from a template
  category: string;
  storage_path: string;
  public_url: string;
  caption: string | null;            // mapped from ai_caption / file_name
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
  asset_count: number;       // direct + template-shared
};

// Buildings + per-building counts (drives step 1 of the picker).
//
// Counts every live row in beithady_gallery_assets where building_code
// is set, then counts distinct listings in guesty_listings for the
// "X units" sub-line. We don't dedupe between direct + template since
// the same unit will show both as inherited photos.
export async function getAssetBuildingsSummary(): Promise<BuildingAssetSummary[]> {
  const sb = supabaseAdmin();
  // Asset counts per building (live only).
  const { data: assetRows } = await sb
    .from('beithady_gallery_assets')
    .select('building_code')
    .is('deleted_at', null)
    .not('building_code', 'is', null)
    .limit(100_000);
  const assetCounts = new Map<string, number>();
  for (const r of (assetRows as Array<{ building_code: string }> | null) || []) {
    assetCounts.set(r.building_code, (assetCounts.get(r.building_code) || 0) + 1);
  }
  // Listing counts per building (active only).
  const { data: listingRows } = await sb
    .from('guesty_listings')
    .select('building_code')
    .eq('active', true)
    .not('building_code', 'is', null)
    .limit(10_000);
  const listingCounts = new Map<string, number>();
  for (const r of (listingRows as Array<{ building_code: string }> | null) || []) {
    listingCounts.set(r.building_code, (listingCounts.get(r.building_code) || 0) + 1);
  }
  return Array.from(assetCounts.entries())
    .map(([building_code, asset_count]) => ({
      building_code,
      asset_count,
      listing_count: listingCounts.get(building_code) || 0,
    }))
    .sort((a, b) => a.building_code.localeCompare(b.building_code));
}

// Listings within a building, with the effective per-listing asset
// count = direct + template-shared.
export async function getListingsInBuildingWithAssets(buildingCode: string): Promise<ListingAssetSummary[]> {
  const sb = supabaseAdmin();
  const { data: listings } = await sb
    .from('guesty_listings')
    .select('id, nickname, building_code, unit_template_id')
    .eq('building_code', buildingCode)
    .eq('active', true)
    .order('nickname', { ascending: true });
  const listingRows = (listings as Array<{
    id: string;
    nickname: string | null;
    building_code: string | null;
    unit_template_id: string | null;
  }> | null) || [];
  if (listingRows.length === 0) return [];

  const listingIds = listingRows.map(l => l.id);
  const templateIds = Array.from(
    new Set(listingRows.map(l => l.unit_template_id).filter((x): x is string => !!x)),
  );

  // Direct: assets keyed to a listing in this building.
  const directCounts = new Map<string, number>();
  if (listingIds.length) {
    const { data: directRows } = await sb
      .from('beithady_gallery_assets')
      .select('listing_id')
      .in('listing_id', listingIds)
      .is('deleted_at', null)
      .limit(100_000);
    for (const r of (directRows as Array<{ listing_id: string }> | null) || []) {
      directCounts.set(r.listing_id, (directCounts.get(r.listing_id) || 0) + 1);
    }
  }

  // Template-shared: assets keyed to a unit_template referenced by
  // any listing in this building.
  const templateCounts = new Map<string, number>();
  if (templateIds.length) {
    const { data: tplRows } = await sb
      .from('beithady_gallery_assets')
      .select('unit_template_id')
      .in('unit_template_id', templateIds)
      .is('deleted_at', null)
      .limit(100_000);
    for (const r of (tplRows as Array<{ unit_template_id: string }> | null) || []) {
      templateCounts.set(r.unit_template_id, (templateCounts.get(r.unit_template_id) || 0) + 1);
    }
  }

  return listingRows.map(l => {
    const direct = directCounts.get(l.id) || 0;
    const tpl = l.unit_template_id ? (templateCounts.get(l.unit_template_id) || 0) : 0;
    return {
      listing_id: l.id,
      nickname: l.nickname,
      building_code: l.building_code,
      asset_count: direct + tpl,
    };
  });
}

// Effective assets visible for one listing = its direct rows UNION the
// rows attached to its unit_template (if any).
export async function getListingAssets(listingId: string): Promise<ListingAsset[]> {
  const sb = supabaseAdmin();
  // Lookup the listing's unit_template_id once.
  const { data: lst } = await sb
    .from('guesty_listings')
    .select('id, unit_template_id')
    .eq('id', listingId)
    .maybeSingle();
  const unitTemplateId = (lst as { unit_template_id: string | null } | null)?.unit_template_id || null;

  // Single query covering both via OR — much faster than two round-trips.
  let q = sb
    .from('beithady_gallery_assets')
    .select('id, listing_id, category, storage_path, storage_bucket, public_url, file_name, mime_type, size_bytes, sort_order, created_at, ai_caption')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(500);
  if (unitTemplateId) {
    q = q.or(`listing_id.eq.${listingId},unit_template_id.eq.${unitTemplateId}`);
  } else {
    q = q.eq('listing_id', listingId);
  }
  const { data } = await q;
  type Row = {
    id: string;
    listing_id: string | null;
    category: string;
    storage_path: string;
    storage_bucket: string;
    public_url: string | null;
    file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    sort_order: number;
    created_at: string;
    ai_caption: string | null;
  };
  return ((data as Row[] | null) || []).map(r => ({
    id: r.id,
    listing_id: r.listing_id,
    category: r.category,
    storage_path: r.storage_path,
    public_url: r.public_url || '',
    caption: r.ai_caption || r.file_name,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    sort_order: r.sort_order,
    created_at: r.created_at,
  }));
}
