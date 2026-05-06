import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { signedUrlFor, publicUrlFor, type GalleryBucket, type ImageTransform } from './storage';

// Tile size in the grid is ~300-350 px on desktop (6 columns at 1920 px).
// 400 px gives a 1.1x DPR margin and ~95% bandwidth savings vs. originals.
const THUMBNAIL_TRANSFORM: ImageTransform = {
  width: 400,
  height: 400,
  resize: 'cover',
  quality: 70,
};

// Smaller thumbnail used for unit-folder covers on the building landing
// (each folder card is ~150-200 px square).
const COVER_TRANSFORM: ImageTransform = {
  width: 300,
  height: 300,
  resize: 'cover',
  quality: 65,
};

export type GalleryAsset = {
  id: string;
  building_code: string | null;
  listing_id: string | null;
  unit_template_id: string | null;
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
  unitTemplateId?: string;  // when set: query the template's shared library instead of listing_id scope
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
      'id, building_code, listing_id, unit_template_id, category, storage_bucket, storage_path, public_url, file_name, mime_type, width, height, duration_sec, size_bytes, ai_tags, ai_caption, ai_quality_score, ai_processed_at, manual_tags, ad_eligible, uploaded_by, notes, created_at',
      { count: 'exact' }
    )
    .is('deleted_at', null);

  if (f.building) q = q.eq('building_code', f.building);
  // Template-scoped query takes precedence over listing scope. Two
  // listings in the same template share the same library; the page
  // resolves listing → template before calling here.
  if (f.unitTemplateId) {
    q = q.eq('unit_template_id', f.unitTemplateId);
  } else if (f.listingId) {
    q = q.eq('listing_id', f.listingId);
  }
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
// mirrored, else fresh signed URL. Pass transform for a downscaled
// thumbnail via Supabase's /render/image/ endpoint.
export async function viewableUrlForAsset(
  asset: Pick<GalleryAsset, 'storage_bucket' | 'storage_path' | 'public_url' | 'ad_eligible' | 'mime_type'>,
  options?: { transform?: ImageTransform },
): Promise<string | null> {
  const transform = options?.transform;
  // Image transforms only apply to images. Videos / PDFs / other → original URL.
  const wantsTransform = !!transform && (asset.mime_type?.startsWith('image/') ?? false);

  // Ad-eligible asset has a cached public_url for the FULL-SIZE image.
  // For thumbnails we re-mint via getPublicUrl with transform options.
  if (asset.ad_eligible && asset.public_url && !wantsTransform) {
    return asset.public_url;
  }
  if (asset.storage_bucket === 'beithady-gallery-public' || asset.ad_eligible) {
    return publicUrlFor(
      'beithady-gallery-public' as GalleryBucket,
      asset.storage_path,
      wantsTransform ? transform : undefined,
    );
  }
  return signedUrlFor(
    asset.storage_bucket as GalleryBucket,
    asset.storage_path,
    undefined,
    wantsTransform ? transform : undefined,
  );
}

// Resolve URLs for an array of assets in parallel (RSC-side).
// Used by pages that render <SelectableAssetGrid> — the client grid
// receives pre-resolved URLs as props so it doesn't need its own
// signed-URL fetcher.
// For images, returns thumbnails (400×400 cover, q=70) via Supabase's
// /render/image/ transform endpoint — typically 20-50 KB each instead
// of 5-15 MB originals. Videos / PDFs / non-images return the regular
// URL (transforms only apply to images). The full-size URL is fetched
// on demand by the asset detail modal.
export async function resolveAssetUrls(assets: GalleryAsset[]): Promise<Array<{ asset: GalleryAsset; url: string | null }>> {
  return Promise.all(assets.map(async asset => ({
    asset,
    url: await viewableUrlForAsset(asset, { transform: THUMBNAIL_TRANSFORM }),
  })));
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
export async function getListingsForBuilding(buildingCode: string): Promise<Array<{ listing_id: string; nickname: string; assets: number; unit_template_id: string | null }>> {
  const sb = supabaseAdmin();
  const [{ data: listings }, { data: assetCounts }] = await Promise.all([
    sb
      .from('guesty_listings')
      .select('id, nickname, building_code, unit_template_id')
      .eq('building_code', buildingCode)
      .eq('active', true)
      .is('master_listing_id', null)
      .order('nickname'),
    sb
      .from('beithady_gallery_assets')
      .select('listing_id, unit_template_id')
      .eq('building_code', buildingCode)
      .is('deleted_at', null),
  ]);
  const listingRows = ((listings as Array<{ id: string; nickname: string | null; unit_template_id: string | null }> | null) || []);
  const assetRows = ((assetCounts as Array<{ listing_id: string | null; unit_template_id: string | null }> | null) || []);

  // Tally per listing AND per template — a listing's count includes
  // its template's shared photos.
  const byListing = new Map<string, number>();
  const byTemplate = new Map<string, number>();
  for (const r of assetRows) {
    if (r.listing_id) byListing.set(r.listing_id, (byListing.get(r.listing_id) || 0) + 1);
    if (r.unit_template_id) byTemplate.set(r.unit_template_id, (byTemplate.get(r.unit_template_id) || 0) + 1);
  }

  return listingRows.map(l => ({
    listing_id: l.id,
    nickname: l.nickname || l.id,
    unit_template_id: l.unit_template_id,
    assets: (byListing.get(l.id) || 0) + (l.unit_template_id ? (byTemplate.get(l.unit_template_id) || 0) : 0),
  }));
}

// Detailed unit folder summary — adds cover thumbnail + photo/video/
// document/ad-eligible counts. Used by the building page to render
// one folder per (template OR standalone listing). Listings that
// share a unit_template_id are collapsed into a single template
// folder card; click-through navigates to any one of the member
// listings (their gallery shows the same shared library).
export type UnitFolder = {
  listing_id: string;          // canonical click-through listing (first member if templated)
  nickname: string;            // template name OR listing nickname
  title: string | null;        // descriptive subtitle (member listings if templated)
  photos: number;
  videos: number;
  documents: number;
  ad_eligible: number;
  total: number;
  cover_url: string | null;
  cover_caption: string | null;
  unit_template_id: string | null;  // present when this folder represents a template
  member_listing_ids: string[];     // listings collapsed into this folder (1 entry for standalone)
};

export async function getUnitFoldersForBuilding(buildingCode: string): Promise<UnitFolder[]> {
  const sb = supabaseAdmin();
  const { data: listings } = await sb
    .from('guesty_listings')
    .select('id, nickname, title, building_code, unit_template_id')
    .eq('building_code', buildingCode)
    .eq('active', true)
    .is('master_listing_id', null)
    .order('nickname');
  const listingRows = (listings as Array<{ id: string; nickname: string | null; title: string | null; unit_template_id: string | null }> | null) || [];
  if (listingRows.length === 0) return [];

  const ids = listingRows.map(l => l.id);
  const templateIds = Array.from(new Set(listingRows.map(l => l.unit_template_id).filter((x): x is string => !!x)));

  const [{ data: assets }, { data: templates }] = await Promise.all([
    sb
      .from('beithady_gallery_assets')
      .select('id, listing_id, unit_template_id, category, ad_eligible, storage_bucket, storage_path, public_url, ai_caption, file_name, created_at')
      .or(
        templateIds.length > 0
          ? `listing_id.in.(${ids.map(x => `"${x}"`).join(',')}),unit_template_id.in.(${templateIds.map(x => `"${x}"`).join(',')})`
          : `listing_id.in.(${ids.map(x => `"${x}"`).join(',')})`,
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    templateIds.length > 0
      ? sb.from('beithady_unit_templates').select('id, name, description').in('id', templateIds)
      : Promise.resolve({ data: [] }),
  ]);
  const assetRows = (assets as Array<{
    id: string;
    listing_id: string | null;
    unit_template_id: string | null;
    category: string;
    ad_eligible: boolean;
    storage_bucket: GalleryBucket;
    storage_path: string;
    public_url: string | null;
    ai_caption: string | null;
    file_name: string | null;
    created_at: string;
  }> | null) || [];
  const templateRows = (templates as Array<{ id: string; name: string; description: string | null }> | null) || [];
  const tplById = new Map(templateRows.map(t => [t.id, t]));

  // Group asset rows by their bucket: per-template if the asset has
  // unit_template_id, else per-listing.
  const byBucket = new Map<string, typeof assetRows>();
  const bucketKey = (a: typeof assetRows[number]) =>
    a.unit_template_id ? `tpl:${a.unit_template_id}` : a.listing_id ? `lst:${a.listing_id}` : null;
  for (const a of assetRows) {
    const k = bucketKey(a);
    if (!k) continue;
    const arr = byBucket.get(k) || [];
    arr.push(a);
    byBucket.set(k, arr);
  }

  // Bucket listings: each templated listing contributes to its template's
  // folder (one folder per template); each non-templated listing gets
  // its own folder.
  const seenTemplates = new Set<string>();
  const folderInputs: Array<{
    bucketKey: string;
    folderListingId: string;          // canonical click-through
    nickname: string;
    title: string | null;
    unit_template_id: string | null;
    member_listing_ids: string[];
  }> = [];

  for (const l of listingRows) {
    if (l.unit_template_id) {
      if (seenTemplates.has(l.unit_template_id)) continue;
      seenTemplates.add(l.unit_template_id);
      const members = listingRows.filter(x => x.unit_template_id === l.unit_template_id);
      const tpl = tplById.get(l.unit_template_id);
      folderInputs.push({
        bucketKey: `tpl:${l.unit_template_id}`,
        folderListingId: members[0].id,
        nickname: tpl?.name || `Template ${l.unit_template_id.slice(0, 8)}`,
        title: tpl?.description || members.map(m => m.nickname).join(', '),
        unit_template_id: l.unit_template_id,
        member_listing_ids: members.map(m => m.id),
      });
    } else {
      folderInputs.push({
        bucketKey: `lst:${l.id}`,
        folderListingId: l.id,
        nickname: l.nickname || l.id,
        title: l.title,
        unit_template_id: null,
        member_listing_ids: [l.id],
      });
    }
  }

  const folders: UnitFolder[] = await Promise.all(folderInputs.map(async fi => {
    const list = byBucket.get(fi.bucketKey) || [];
    const photos = list.filter(a => a.category === 'photo').length;
    const videos = list.filter(a => a.category === 'video').length;
    const documents = list.filter(a => a.category === 'document').length;
    const adEligible = list.filter(a => a.ad_eligible).length;
    const coverAsset = list.find(a => a.category === 'photo');
    let coverUrl: string | null = null;
    if (coverAsset) {
      coverUrl = coverAsset.ad_eligible
        ? publicUrlFor('beithady-gallery-public' as GalleryBucket, coverAsset.storage_path, COVER_TRANSFORM)
        : await signedUrlFor(coverAsset.storage_bucket, coverAsset.storage_path, 3600, COVER_TRANSFORM);
    }
    return {
      listing_id: fi.folderListingId,
      nickname: fi.nickname,
      title: fi.title,
      photos,
      videos,
      documents,
      ad_eligible: adEligible,
      total: list.length,
      cover_url: coverUrl,
      cover_caption: coverAsset?.ai_caption || coverAsset?.file_name || null,
      unit_template_id: fi.unit_template_id,
      member_listing_ids: fi.member_listing_ids,
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
      .eq('building_code', buildingCode).is('listing_id', null).is('unit_template_id', null).is('deleted_at', null),
    sb.from('beithady_gallery_assets').select('id', { count: 'exact', head: true })
      .eq('building_code', buildingCode).is('listing_id', null).is('unit_template_id', null).is('deleted_at', null).eq('category', 'photo'),
    sb.from('beithady_gallery_assets').select('id', { count: 'exact', head: true })
      .eq('building_code', buildingCode).is('listing_id', null).is('unit_template_id', null).is('deleted_at', null).eq('category', 'video'),
    sb.from('beithady_gallery_assets').select('storage_bucket, storage_path, public_url')
      .eq('building_code', buildingCode).is('listing_id', null).is('unit_template_id', null).is('deleted_at', null).eq('category', 'photo')
      .order('created_at', { ascending: false }).limit(1),
  ]);
  const first = ((coverData as Array<{ storage_bucket: GalleryBucket; storage_path: string; public_url: string | null }> | null) || [])[0];
  let coverUrl: string | null = null;
  if (first) {
    // Thumbnail-sized cover (300x300 q=65) — bypasses full-size public_url cache.
    coverUrl = await signedUrlFor(first.storage_bucket, first.storage_path, 3600, COVER_TRANSFORM);
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
