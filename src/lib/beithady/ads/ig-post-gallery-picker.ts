import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Surfaces postable Beithady gallery assets for the IG Post picker.
// Filters:
//   - has public_url (Meta needs a public HTTPS URL; null URLs mean the asset
//     was never mirrored to the public bucket)
//   - not soft-deleted
//   - category in (photo, video, ad_creative) — documents and brand assets
//     are excluded by default but `includeBrand` re-adds brand_asset
//
// Grouped by building. Assets with null building_code land in a synthetic
// 'unfiled' group so the UI doesn't drop them.

export type GalleryPickerAsset = {
  id: string;
  public_url: string;
  thumb_url: string;            // same as public_url for images; for videos a poster if we ever store one
  category: 'photo' | 'video' | 'ad_creative' | 'brand_asset';
  building_code: string | null;
  file_name: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  ai_caption: string | null;
};

export type GalleryGroup = {
  key: string;           // building_code or 'ad_creatives' / 'brand' / 'unfiled'
  label: string;
  assets: GalleryPickerAsset[];
};

export async function listGalleryAssetsForIgPost(
  opts: { limit?: number; includeBrand?: boolean } = {},
): Promise<GalleryGroup[]> {
  const sb = supabaseAdmin();
  const cats = ['photo', 'video', 'ad_creative'];
  if (opts.includeBrand) cats.push('brand_asset');

  const { data } = await sb
    .from('beithady_gallery_assets')
    .select('id, public_url, category, building_code, file_name, width, height, duration_sec, ai_caption, created_at')
    .in('category', cats)
    .not('public_url', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500);
  const rows = (data as Array<GalleryPickerAsset & { created_at: string }> | null) || [];

  // Bucket by group key
  const groupsMap = new Map<string, GalleryGroup>();
  const getOrInit = (key: string, label: string): GalleryGroup => {
    let g = groupsMap.get(key);
    if (!g) {
      g = { key, label, assets: [] };
      groupsMap.set(key, g);
    }
    return g;
  };

  for (const r of rows) {
    const asset: GalleryPickerAsset = {
      id: r.id,
      public_url: r.public_url,
      thumb_url: r.public_url, // category=video → public_url IS the .mp4; UI can render <video> if mime is video
      category: r.category,
      building_code: r.building_code,
      file_name: r.file_name,
      width: r.width,
      height: r.height,
      duration_sec: r.duration_sec,
      ai_caption: r.ai_caption,
    };
    if (r.category === 'ad_creative') {
      getOrInit('ad_creatives', 'Ad creatives').assets.push(asset);
    } else if (r.category === 'brand_asset') {
      getOrInit('brand', 'Brand library').assets.push(asset);
    } else if (r.building_code) {
      getOrInit(r.building_code, r.building_code).assets.push(asset);
    } else {
      getOrInit('unfiled', 'Unfiled').assets.push(asset);
    }
  }

  // Stable ordering: ad creatives first, then buildings alpha, then brand, then unfiled
  const order = (k: string) => {
    if (k === 'ad_creatives') return 0;
    if (k === 'brand') return 2;
    if (k === 'unfiled') return 3;
    return 1;
  };
  return [...groupsMap.values()].sort((a, b) => {
    const oa = order(a.key); const ob = order(b.key);
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });
}
