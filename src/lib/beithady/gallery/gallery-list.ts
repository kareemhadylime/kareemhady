import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { signedUrlFor, publicUrlFor, type GalleryBucket } from './storage';

export type GalleryAsset = {
  id: string;
  building_code: string | null;
  listing_id: string | null;
  category: 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative';
  storage_bucket: GalleryBucket;
  storage_path: string;
  public_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  size_bytes: number | null;
  ai_tags: string[];
  ai_caption: string | null;
  ai_quality_score: number | null;
  ai_processed_at: string | null;
  manual_tags: string[];
  ad_eligible: boolean;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
};

export type GalleryFilter = {
  building?: string;
  listingId?: string;
  category?: GalleryAsset['category'];
  searchTag?: string;       // matches in ai_tags OR manual_tags
  adEligibleOnly?: boolean;
  minQuality?: number;
};

export async function listAssets(opts: {
  filter?: GalleryFilter;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: GalleryAsset[]; total: number; page: number; pageSize: number }> {
  const sb = supabaseAdmin();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, opts.pageSize ?? 60));
  const f = opts.filter ?? {};

  let q = sb
    .from('beithady_gallery_assets')
    .select(
      'id, building_code, listing_id, category, storage_bucket, storage_path, public_url, file_name, mime_type, width, height, duration_sec, size_bytes, ai_tags, ai_caption, ai_quality_score, ai_processed_at, manual_tags, ad_eligible, uploaded_by, notes, created_at',
      { count: 'exact' }
    )
    .is('deleted_at', null);

  if (f.building) q = q.eq('building_code', f.building);
  if (f.listingId) q = q.eq('listing_id', f.listingId);
  if (f.category) q = q.eq('category', f.category);
  if (f.adEligibleOnly) q = q.eq('ad_eligible', true);
  if (typeof f.minQuality === 'number') q = q.gte('ai_quality_score', f.minQuality);
  if (f.searchTag && f.searchTag.trim()) {
    const t = f.searchTag.trim().toLowerCase();
    q = q.or(`ai_tags.cs.{${t}},manual_tags.cs.{${t}}`);
  }

  q = q
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count } = await q;
  return { rows: (data as GalleryAsset[] | null) || [], total: count ?? 0, page, pageSize };
}

export async function getAsset(id: string): Promise<GalleryAsset | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_gallery_assets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as GalleryAsset | null) || null;
}

// Resolve a viewable URL for an asset — public URL if ad-eligible &
// mirrored, else fresh signed URL.
export async function viewableUrlForAsset(asset: Pick<GalleryAsset, 'storage_bucket' | 'storage_path' | 'public_url' | 'ad_eligible'>): Promise<string | null> {
  if (asset.ad_eligible && asset.public_url) return asset.public_url;
  if (asset.storage_bucket === 'beithady-gallery-public') {
    return publicUrlFor(asset.storage_bucket as GalleryBucket, asset.storage_path);
  }
  return signedUrlFor(asset.storage_bucket as GalleryBucket, asset.storage_path);
}

// Building summary view
export type BuildingSummary = {
  building_code: string | null;
  photos: number;
  videos: number;
  documents: number;
  brand_assets: number;
  ad_creatives: number;
  ad_eligible_count: number;
  total_bytes: number;
  latest_upload_at: string | null;
};

export async function getBuildingSummaries(): Promise<BuildingSummary[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_gallery_building_summary').select('*');
  return ((data as BuildingSummary[] | null) || []).sort((a, b) => {
    const aOrder = a.building_code ? 0 : 1;
    const bOrder = b.building_code ? 0 : 1;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.building_code || '').localeCompare(b.building_code || '');
  });
}

// Distinct listings per building (filtered by what's actually in beithady_guests + guesty_listings).
// MTL children are collapsed via `master_listing_id IS NULL` — see
// migration 0042 + the "Beithady MTL polarity" notes in src/lib/beithady/mtl.ts.
export async function getListingsForBuilding(buildingCode: string): Promise<Array<{ listing_id: string; nickname: string; assets: number }>> {
  const sb = supabaseAdmin();
  const [{ data: listings }, { data: assetCounts }] = await Promise.all([
    sb
      .from('guesty_listings')
      .select('id, nickname, building_code')
      .eq('building_code', buildingCode)
      .eq('active', true)
      .is('master_listing_id', null)
      .order('nickname'),
    sb
      .from('beithady_gallery_assets')
      .select('listing_id')
      .eq('building_code', buildingCode)
      .is('deleted_at', null),
  ]);
  const tally = new Map<string, number>();
  for (const r of (assetCounts as Array<{ listing_id: string | null }> | null) || []) {
    if (r.listing_id) tally.set(r.listing_id, (tally.get(r.listing_id) || 0) + 1);
  }
  return ((listings as Array<{ id: string; nickname: string | null }> | null) || []).map(l => ({
    listing_id: l.id,
    nickname: l.nickname || l.id,
    assets: tally.get(l.id) || 0,
  }));
}

// Detailed unit folder summary — adds cover thumbnail + photo/video/
// document/ad-eligible counts. Used by the building page to render
// one folder per MTL parent + one folder per standalone listing.
// MTL children are dropped via `master_listing_id IS NULL` because
// they share pictures/features with their parent (single upload to
// the MTL covers every sub-unit). Cover is the most-recent photo
// for that listing.
export type UnitFolder = {
  listing_id: string;
  nickname: string;
  title: string | null;
  photos: number;
  videos: number;
  documents: number;
  ad_eligible: number;
  total: number;
  cover_url: string | null;
  cover_caption: string | null;
};

export async function getUnitFoldersForBuilding(buildingCode: string): Promise<UnitFolder[]> {
  const sb = supabaseAdmin();
  const { data: listings } = await sb
    .from('guesty_listings')
    .select('id, nickname, title, building_code')
    .eq('building_code', buildingCode)
    .eq('active', true)
    .is('master_listing_id', null)
    .order('nickname');
  const listingRows = (listings as Array<{ id: string; nickname: string | null; title: string | null }> | null) || [];
  if (listingRows.length === 0) return [];

  const ids = listingRows.map(l => l.id);
  const { data: assets } = await sb
    .from('beithady_gallery_assets')
    .select('id, listing_id, category, ad_eligible, storage_bucket, storage_path, public_url, ai_caption, file_name, created_at')
    .in('listing_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const assetRows = (assets as Array<{
    id: string;
    listing_id: string | null;
    category: string;
    ad_eligible: boolean;
    storage_bucket: GalleryBucket;
    storage_path: string;
    public_url: string | null;
    ai_caption: string | null;
    file_name: string | null;
    created_at: string;
  }> | null) || [];

  const byListing = new Map<string, typeof assetRows>();
  for (const a of assetRows) {
    if (!a.listing_id) continue;
    const arr = byListing.get(a.listing_id) || [];
    arr.push(a);
    byListing.set(a.listing_id, arr);
  }

  const folders: UnitFolder[] = await Promise.all(listingRows.map(async l => {
    const list = byListing.get(l.id) || [];
    const photos = list.filter(a => a.category === 'photo').length;
    const videos = list.filter(a => a.category === 'video').length;
    const documents = list.filter(a => a.category === 'document').length;
    const adEligible = list.filter(a => a.ad_eligible).length;
    const coverAsset = list.find(a => a.category === 'photo');
    let coverUrl: string | null = null;
    if (coverAsset) {
      coverUrl = coverAsset.public_url || (await signedUrlFor(coverAsset.storage_bucket, coverAsset.storage_path, 3600));
    }
    return {
      listing_id: l.id,
      nickname: l.nickname || l.id,
      title: l.title,
      photos,
      videos,
      documents,
      ad_eligible: adEligible,
      total: list.length,
      cover_url: coverUrl,
      cover_caption: coverAsset?.ai_caption || coverAsset?.file_name || null,
    };
  }));

  return folders.sort((a, b) => a.nickname.localeCompare(b.nickname));
}

// "General Building Area" folder summary — assets at the building
// level with no listing_id (lobby, pool, gym, exterior, building-wide).
export async function getCommonAreaSummary(buildingCode: string): Promise<{
  count: number;
  photos: number;
  videos: number;
  cover_url: string | null;
}> {
  const sb = supabaseAdmin();
  const [{ count: total }, { count: photos }, { count: videos }, { data: coverData }] = await Promise.all([
    sb.from('beithady_gallery_assets').select('id', { count: 'exact', head: true })
      .eq('building_code', buildingCode).is('listing_id', null).is('deleted_at', null),
    sb.from('beithady_gallery_assets').select('id', { count: 'exact', head: true })
      .eq('building_code', buildingCode).is('listing_id', null).is('deleted_at', null).eq('category', 'photo'),
    sb.from('beithady_gallery_assets').select('id', { count: 'exact', head: true })
      .eq('building_code', buildingCode).is('listing_id', null).is('deleted_at', null).eq('category', 'video'),
    sb.from('beithady_gallery_assets').select('storage_bucket, storage_path, public_url')
      .eq('building_code', buildingCode).is('listing_id', null).is('deleted_at', null).eq('category', 'photo')
      .order('created_at', { ascending: false }).limit(1),
  ]);
  const first = ((coverData as Array<{ storage_bucket: GalleryBucket; storage_path: string; public_url: string | null }> | null) || [])[0];
  let coverUrl: string | null = null;
  if (first) {
    coverUrl = first.public_url || (await signedUrlFor(first.storage_bucket, first.storage_path, 3600));
  }
  return { count: total ?? 0, photos: photos ?? 0, videos: videos ?? 0, cover_url: coverUrl };
}

// Popular tags in this scope (used in filter chips)
export async function getTopTags(filter: GalleryFilter, limit = 20): Promise<Array<{ tag: string; count: number }>> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_gallery_assets')
    .select('ai_tags, manual_tags')
    .is('deleted_at', null)
    .limit(1000);
  if (filter.building) q = q.eq('building_code', filter.building);
  if (filter.listingId) q = q.eq('listing_id', filter.listingId);
  if (filter.category) q = q.eq('category', filter.category);
  const { data } = await q;
  const tally = new Map<string, number>();
  for (const r of (data as Array<{ ai_tags: string[] | null; manual_tags: string[] | null }> | null) || []) {
    for (const t of (r.ai_tags || []).concat(r.manual_tags || [])) {
      if (!t) continue;
      tally.set(t, (tally.get(t) || 0) + 1);
    }
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}
