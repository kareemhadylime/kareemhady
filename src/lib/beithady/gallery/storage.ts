import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Storage bucket helpers — signed URL minting for private buckets,
// public URL for ad-eligible mirrors, and cross-bucket copy when an
// asset is promoted to ad_eligible.

export const PRIVATE_BUCKET = 'beithady-gallery';
export const PUBLIC_BUCKET = 'beithady-gallery-public';
export const DOCUMENTS_BUCKET = 'beithady-documents';

export type GalleryBucket =
  | 'beithady-gallery'
  | 'beithady-gallery-public'
  | 'beithady-documents';

const SIGNED_URL_TTL_SEC = 3600; // 1h

export async function signedUrlFor(bucket: GalleryBucket, path: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data) return null;
  return data.signedUrl;
}

export function publicUrlFor(bucket: GalleryBucket, path: string): string | null {
  const sb = supabaseAdmin();
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl ?? null;
}

// Copy a private asset to the public bucket so an ad creative URL can
// be served via CDN. Returns the new public URL.
export async function promoteToPublic(
  privatePath: string
): Promise<{ ok: true; publicUrl: string; publicPath: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  // Download from private bucket
  const { data: blob, error: dlErr } = await sb.storage.from(PRIVATE_BUCKET).download(privatePath);
  if (dlErr || !blob) return { ok: false, error: dlErr?.message || 'download_failed' };
  // Upload to public bucket — same path so we can find/delete easily
  const ab = await blob.arrayBuffer();
  const { error: upErr } = await sb.storage
    .from(PUBLIC_BUCKET)
    .upload(privatePath, new Uint8Array(ab), { contentType: blob.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };
  const { data } = sb.storage.from(PUBLIC_BUCKET).getPublicUrl(privatePath);
  return { ok: true, publicUrl: data.publicUrl, publicPath: privatePath };
}

export async function demoteFromPublic(publicPath: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(PUBLIC_BUCKET).remove([publicPath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Generate a build-specific upload path for new assets.
export function buildAssetPath(opts: {
  category: string;
  building?: string | null;
  listing?: string | null;
  ext: string;
}): string {
  const dt = new Date().toISOString().slice(0, 10);
  const id = Math.random().toString(36).slice(2, 10);
  const folder = opts.category === 'document'
    ? `documents/${opts.building || 'common'}`
    : opts.category === 'brand_asset'
      ? 'brand-library'
      : opts.category === 'ad_creative'
        ? 'ad-creatives'
        : `${opts.building || 'common'}/${opts.listing || 'common'}`;
  return `${folder}/${dt}/${id}.${opts.ext}`;
}

export async function uploadToBucket(
  bucket: GalleryBucket,
  path: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { error } = await sb.storage
    .from(bucket)
    .upload(path, new Uint8Array(bytes), { contentType, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteFromBucket(
  bucket: GalleryBucket,
  path: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(bucket).remove([path]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Storage usage roll-up — used in Settings + the gallery landing.
export async function getGalleryUsage(): Promise<{
  total_bytes: number;
  asset_count: number;
  ad_eligible_count: number;
  by_building: Array<{ building_code: string | null; bytes: number; count: number }>;
}> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_gallery_assets')
    .select('building_code, size_bytes, ad_eligible')
    .is('deleted_at', null)
    .limit(20000);
  const rows = (data as Array<{ building_code: string | null; size_bytes: number | null; ad_eligible: boolean }> | null) || [];
  let total = 0;
  let adEligible = 0;
  const byBuilding = new Map<string, { bytes: number; count: number }>();
  for (const r of rows) {
    const b = Number(r.size_bytes) || 0;
    total += b;
    if (r.ad_eligible) adEligible += 1;
    const k = r.building_code ?? '(unassigned)';
    const cur = byBuilding.get(k) || { bytes: 0, count: 0 };
    cur.bytes += b;
    cur.count += 1;
    byBuilding.set(k, cur);
  }
  return {
    total_bytes: total,
    asset_count: rows.length,
    ad_eligible_count: adEligible,
    by_building: Array.from(byBuilding.entries())
      .map(([k, v]) => ({ building_code: k === '(unassigned)' ? null : k, ...v }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
