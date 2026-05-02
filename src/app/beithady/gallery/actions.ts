'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { queueLabelJob, processQueuedJobs } from '@/lib/beithady/gallery/ai-label';
import {
  buildAssetPath,
  uploadToBucket,
  deleteFromBucket,
  promoteToPublic,
  demoteFromPublic,
  PRIVATE_BUCKET,
  DOCUMENTS_BUCKET,
  type GalleryBucket,
} from '@/lib/beithady/gallery/storage';

type UploadCategory = 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative';

async function requirePermission(level: 'read' | 'full') {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'gallery', level));
  if (!allowed) throw new Error('forbidden');
  return user;
}

function extFor(filename: string, mime: string): string {
  const fromName = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  if (fromName) return fromName;
  if (mime.startsWith('image/jpeg')) return 'jpg';
  if (mime.startsWith('image/png')) return 'png';
  if (mime.startsWith('image/webp')) return 'webp';
  if (mime.startsWith('image/gif')) return 'gif';
  if (mime.startsWith('image/heic')) return 'heic';
  if (mime.startsWith('video/mp4')) return 'mp4';
  if (mime.startsWith('video/webm')) return 'webm';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

function categoryForMime(mime: string): 'photo' | 'video' | 'document' {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

// =====================================================================
// Direct-to-Supabase upload (bypasses Vercel's ~4.5 MB function body cap)
// =====================================================================
// Pattern: client calls signGalleryUploadAction → gets signed URL +
// path/token → uses supabaseBrowser().storage.uploadToSignedUrl() to
// PUT bytes directly to Supabase → calls registerGalleryUploadAction
// to insert the DB row. The file bytes never traverse Vercel.

export async function signGalleryUploadAction(input: {
  fileName: string;
  mime: string;
  building: string | null;
  listingId: string | null;
  category?: UploadCategory;
}): Promise<
  | { ok: true; signedUrl: string; path: string; bucket: GalleryBucket; token: string }
  | { ok: false; error: string }
> {
  await requirePermission('full');
  const fileName = String(input.fileName || 'upload');
  const mime = input.mime || 'application/octet-stream';
  const explicitCategory = input.category;
  const category: UploadCategory = (explicitCategory && ['photo','video','document','brand_asset','ad_creative'].includes(explicitCategory))
    ? explicitCategory
    : categoryForMime(mime);
  const ext = extFor(fileName, mime);
  const path = buildAssetPath({
    category,
    building: input.building,
    listing: input.listingId,
    ext,
  });
  const bucket: GalleryBucket = category === 'document' ? DOCUMENTS_BUCKET : PRIVATE_BUCKET;

  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message || 'sign_failed' };
  }
  return { ok: true, signedUrl: data.signedUrl, path: data.path, bucket, token: data.token };
}

export async function registerGalleryUploadAction(input: {
  path: string;
  bucket: GalleryBucket;
  fileName: string;
  mime: string;
  sizeBytes: number;
  building: string | null;
  listingId: string | null;
  category?: UploadCategory;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission('full');
  const explicitCategory = input.category;
  const category: UploadCategory = (explicitCategory && ['photo','video','document','brand_asset','ad_creative'].includes(explicitCategory))
    ? explicitCategory
    : categoryForMime(input.mime);

  const sb = supabaseAdmin();
  // Compute sort_order so new uploads land at the top of the album.
  let sortOrderForInsert = 0;
  {
    let minQuery = sb
      .from('beithady_gallery_assets')
      .select('sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .limit(1);
    if (input.building) minQuery = minQuery.eq('building_code', input.building);
    else minQuery = minQuery.is('building_code', null);
    if (input.listingId) minQuery = minQuery.eq('listing_id', input.listingId);
    else minQuery = minQuery.is('listing_id', null);
    const { data: minRow } = await minQuery.maybeSingle();
    sortOrderForInsert = ((minRow as { sort_order: number } | null)?.sort_order ?? 0) - 1;
  }

  const { data: ins, error } = await sb
    .from('beithady_gallery_assets')
    .insert({
      building_code: input.building,
      listing_id: input.listingId,
      category,
      storage_bucket: input.bucket,
      storage_path: input.path,
      file_name: input.fileName,
      mime_type: input.mime,
      size_bytes: input.sizeBytes,
      uploaded_by: user.id,
      sort_order: sortOrderForInsert,
    })
    .select('id')
    .single();
  if (error) {
    // Best-effort cleanup of the orphan storage object.
    await deleteFromBucket(input.bucket, input.path).catch(() => {});
    return { ok: false, error: error.message };
  }
  const id = (ins as { id: string }).id;

  if (category === 'photo') {
    await queueLabelJob(id);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'asset_uploaded',
    target_type: 'asset',
    target_id: id,
    metadata: {
      building: input.building,
      listing_id: input.listingId,
      category,
      mime: input.mime,
      size_bytes: input.sizeBytes,
      transport: 'direct-supabase',
    },
  });

  revalidatePath('/beithady/gallery');
  if (input.building) revalidatePath(`/beithady/gallery/${input.building}`);
  if (input.building && input.listingId) revalidatePath(`/beithady/gallery/${input.building}/${input.listingId}`);
  if (input.building && !input.listingId) revalidatePath(`/beithady/gallery/${input.building}/general`);
  return { ok: true, id };
}

// Upload a single file from a multipart form. Files smaller than 50MB
// for media, 100MB for documents — enforced at the bucket level too.
export async function uploadAssetAction(formData: FormData): Promise<void> {
  const user = await requirePermission('full');
  const file = formData.get('file');
  if (!(file instanceof Blob)) throw new Error('missing_file');

  const fileName = String(formData.get('file_name') || (file as File & { name?: string }).name || 'upload');
  const mime = file.type || 'application/octet-stream';
  const building = (formData.get('building') as string) || null;
  const listingId = (formData.get('listing_id') as string) || null;
  const explicitCategory = (formData.get('category') as string) || null;
  const category = (explicitCategory && ['photo','video','document','brand_asset','ad_creative'].includes(explicitCategory))
    ? explicitCategory as 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative'
    : categoryForMime(mime);

  const ext = extFor(fileName, mime);
  const path = buildAssetPath({ category, building, listing: listingId, ext });
  const bucket: GalleryBucket = category === 'document' ? DOCUMENTS_BUCKET : PRIVATE_BUCKET;

  const ab = await file.arrayBuffer();
  const upload = await uploadToBucket(bucket, path, ab, mime);
  if (!upload.ok) throw new Error(`upload_failed: ${upload.error}`);

  const sb = supabaseAdmin();
  // Compute sort_order so new uploads land at the top of the album
  // (one less than current min, scoped to the same building+listing).
  let sortOrderForInsert = 0;
  {
    let minQuery = sb
      .from('beithady_gallery_assets')
      .select('sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .limit(1);
    if (building) minQuery = minQuery.eq('building_code', building);
    else minQuery = minQuery.is('building_code', null);
    if (listingId) minQuery = minQuery.eq('listing_id', listingId);
    else minQuery = minQuery.is('listing_id', null);
    const { data: minRow } = await minQuery.maybeSingle();
    sortOrderForInsert = ((minRow as { sort_order: number } | null)?.sort_order ?? 0) - 1;
  }

  const { data: ins, error } = await sb
    .from('beithady_gallery_assets')
    .insert({
      building_code: building,
      listing_id: listingId,
      category,
      storage_bucket: bucket,
      storage_path: path,
      file_name: fileName,
      mime_type: mime,
      size_bytes: ab.byteLength,
      uploaded_by: user.id,
      sort_order: sortOrderForInsert,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const id = (ins as { id: string }).id;

  if (category === 'photo') {
    await queueLabelJob(id);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'asset_uploaded',
    target_type: 'asset',
    target_id: id,
    metadata: { building, listing_id: listingId, category, mime, size_bytes: ab.byteLength },
  });

  revalidatePath('/beithady/gallery');
  if (building) revalidatePath(`/beithady/gallery/${building}`);
  if (listingId) revalidatePath(`/beithady/gallery/${building}/${listingId}`);
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const user = await requirePermission('full');
  const id = String(formData.get('asset_id') || '').trim();
  if (!id) throw new Error('missing_asset_id');

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_gallery_assets')
    .select('id, storage_bucket, storage_path, public_url, ad_eligible, building_code, listing_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw new Error('not_found');
  const a = existing as {
    id: string; storage_bucket: GalleryBucket; storage_path: string;
    public_url: string | null; ad_eligible: boolean;
    building_code: string | null; listing_id: string | null;
  };

  // Soft-delete the row first
  await sb
    .from('beithady_gallery_assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  // Best-effort hard-delete from storage
  await deleteFromBucket(a.storage_bucket, a.storage_path);
  if (a.ad_eligible) {
    await demoteFromPublic(a.storage_path);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'asset_deleted',
    target_type: 'asset',
    target_id: id,
    metadata: { storage_path: a.storage_path, ad_eligible: a.ad_eligible },
  });

  revalidatePath('/beithady/gallery');
  if (a.building_code) revalidatePath(`/beithady/gallery/${a.building_code}`);
}

export async function retagAssetAction(formData: FormData): Promise<void> {
  const user = await requirePermission('full');
  const id = String(formData.get('asset_id') || '').trim();
  const tagsRaw = String(formData.get('manual_tags') || '').trim();
  if (!id) throw new Error('missing_asset_id');

  const tags = tagsRaw
    .split(/[,\s]+/)
    .map(t => t.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 30);

  const sb = supabaseAdmin();
  await sb
    .from('beithady_gallery_assets')
    .update({ manual_tags: tags })
    .eq('id', id);

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'asset_retagged',
    target_type: 'asset',
    target_id: id,
    metadata: { manual_tags: tags },
  });
  revalidatePath('/beithady/gallery');
}

export async function toggleAdEligibleAction(formData: FormData): Promise<void> {
  const user = await requirePermission('full');
  const id = String(formData.get('asset_id') || '').trim();
  const next = formData.get('next') === 'on';
  if (!id) throw new Error('missing_asset_id');

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_gallery_assets')
    .select('id, storage_bucket, storage_path, ad_eligible')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw new Error('not_found');
  const a = existing as { id: string; storage_bucket: string; storage_path: string; ad_eligible: boolean };

  if (next === a.ad_eligible) return; // no-op

  if (next) {
    // Promote: copy from private to public, store the public URL
    const result = await promoteToPublic(a.storage_path);
    if (!result.ok) throw new Error(`promote_failed: ${result.error}`);
    await sb.rpc('beithady_gallery_set_ad_eligible', {
      p_asset_id: id,
      p_ad_eligible: true,
      p_public_url: result.publicUrl,
    });
  } else {
    // Demote: delete the public copy + clear url
    await demoteFromPublic(a.storage_path);
    await sb.rpc('beithady_gallery_set_ad_eligible', {
      p_asset_id: id,
      p_ad_eligible: false,
      p_public_url: null,
    });
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'ad_eligible_toggled',
    target_type: 'asset',
    target_id: id,
    after: { ad_eligible: next },
  });
  revalidatePath('/beithady/gallery');
}

export async function relabelAssetAction(formData: FormData): Promise<void> {
  const user = await requirePermission('full');
  const id = String(formData.get('asset_id') || '').trim();
  if (!id) throw new Error('missing_asset_id');
  await queueLabelJob(id);
  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'asset_requeued_for_label',
    target_type: 'asset',
    target_id: id,
  });
  revalidatePath('/beithady/gallery');
}

export async function processLabelQueueAction(): Promise<void> {
  const user = await requirePermission('full');
  const result = await processQueuedJobs(5);
  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'manual_label_queue_run',
    metadata: result as unknown as Record<string, unknown>,
  });
  revalidatePath('/beithady/gallery');
}

// =====================================================================
// Bulk operations (Phase: gallery-overhaul)
// =====================================================================

const MAX_BULK_IDS = 200;

type BulkResult = { ok: string[]; failed: Array<{ id: string; error: string }> };

// Reorder assets within a single album by full-list renumber.
// Caller passes the entire ordered ID list for the album page; server
// validates ids ⊂ album, then UPDATEs sort_order = 1..N in one statement.
export async function reorderAssetsAction(input: {
  buildingCode: string | null;
  listingId: string | null;
  orderedIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission('full');
  const { buildingCode, listingId, orderedIds } = input;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'empty_orderedIds' };
  }
  if (orderedIds.length > MAX_BULK_IDS) {
    return { ok: false, error: `too_many_ids_max_${MAX_BULK_IDS}` };
  }

  const sb = supabaseAdmin();
  // Validate every id belongs to this album and isn't deleted.
  let validate = sb
    .from('beithady_gallery_assets')
    .select('id')
    .in('id', orderedIds)
    .is('deleted_at', null);
  if (buildingCode) validate = validate.eq('building_code', buildingCode);
  else validate = validate.is('building_code', null);
  if (listingId) validate = validate.eq('listing_id', listingId);
  else validate = validate.is('listing_id', null);

  const { data: validRows, error: vErr } = await validate;
  if (vErr) return { ok: false, error: vErr.message };
  const validIds = new Set(((validRows as Array<{ id: string }> | null) || []).map(r => r.id));
  if (validIds.size !== orderedIds.length) {
    return { ok: false, error: 'ids_not_in_album' };
  }

  // Renumber: one UPDATE per id (Supabase JS doesn't expose VALUES tables).
  // 200 ids max, runs in well under a second.
  const errors: string[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from('beithady_gallery_assets')
      .update({ sort_order: i + 1 })
      .eq('id', orderedIds[i]);
    if (error) errors.push(`${orderedIds[i]}: ${error.message}`);
  }
  if (errors.length > 0) return { ok: false, error: errors.join('; ') };

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_reordered',
    metadata: { building: buildingCode, listing_id: listingId, count: orderedIds.length },
  });

  revalidatePath('/beithady/gallery');
  if (buildingCode) revalidatePath(`/beithady/gallery/${buildingCode}`);
  if (buildingCode && listingId) revalidatePath(`/beithady/gallery/${buildingCode}/${listingId}`);
  if (buildingCode && !listingId) revalidatePath(`/beithady/gallery/${buildingCode}/general`);
  return { ok: true };
}

export async function bulkDeleteAssetsAction(input: { ids: string[] }): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_gallery_assets')
    .select('id, storage_bucket, storage_path, public_url, ad_eligible, building_code, listing_id')
    .in('id', ids)
    .is('deleted_at', null);
  const records = (rows as Array<{
    id: string; storage_bucket: GalleryBucket; storage_path: string;
    public_url: string | null; ad_eligible: boolean;
    building_code: string | null; listing_id: string | null;
  }> | null) || [];

  // Soft-delete in one UPDATE
  const { error: softErr } = await sb
    .from('beithady_gallery_assets')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', records.map(r => r.id));
  if (softErr) return { ok: [], failed: ids.map(id => ({ id, error: softErr.message })) };

  // Best-effort hard-delete from storage + demote ad-eligible. Concurrency 3.
  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const buildings = new Set<string>();
  const listings = new Set<string>();

  let cursor = 0;
  async function worker() {
    while (cursor < records.length) {
      const idx = cursor++;
      const r = records[idx];
      try {
        await deleteFromBucket(r.storage_bucket, r.storage_path);
        if (r.ad_eligible) await demoteFromPublic(r.storage_path);
        if (r.building_code) buildings.add(r.building_code);
        if (r.listing_id) listings.add(`${r.building_code}/${r.listing_id}`);
        ok.push(r.id);
      } catch (e) {
        // Soft-delete already happened; storage residue is acceptable
        ok.push(r.id);
        failed.push({ id: r.id, error: e instanceof Error ? e.message : 'storage_delete_failed' });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  for (const r of records) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'gallery',
      action: 'asset_deleted',
      target_type: 'asset',
      target_id: r.id,
      metadata: { storage_path: r.storage_path, ad_eligible: r.ad_eligible, bulk: true },
    });
  }

  revalidatePath('/beithady/gallery');
  for (const b of buildings) revalidatePath(`/beithady/gallery/${b}`);
  for (const k of listings) {
    const [b, l] = k.split('/');
    if (l) revalidatePath(`/beithady/gallery/${b}/${l}`);
  }
  return { ok, failed };
}

export async function bulkMoveAssetsAction(input: {
  ids: string[];
  targetBuildingCode: string | null;
  targetListingId: string | null;
}): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  const { targetBuildingCode, targetListingId } = input;
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  // Source records (for revalidation paths)
  const { data: srcRows } = await sb
    .from('beithady_gallery_assets')
    .select('id, building_code, listing_id')
    .in('id', ids)
    .is('deleted_at', null);
  const sources = (srcRows as Array<{ id: string; building_code: string | null; listing_id: string | null }> | null) || [];

  // Compute destination top
  let minQuery = sb
    .from('beithady_gallery_assets')
    .select('sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(1);
  if (targetBuildingCode) minQuery = minQuery.eq('building_code', targetBuildingCode);
  else minQuery = minQuery.is('building_code', null);
  if (targetListingId) minQuery = minQuery.eq('listing_id', targetListingId);
  else minQuery = minQuery.is('listing_id', null);
  const { data: minRow } = await minQuery.maybeSingle();
  const top = ((minRow as { sort_order: number } | null)?.sort_order ?? 0);

  // Update each id with its new sort_order
  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    const newSort = top - ids.length + i;
    const { error } = await sb
      .from('beithady_gallery_assets')
      .update({
        building_code: targetBuildingCode,
        listing_id: targetListingId,
        sort_order: newSort,
      })
      .eq('id', ids[i])
      .is('deleted_at', null);
    if (error) failed.push({ id: ids[i], error: error.message });
    else ok.push(ids[i]);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_bulk_moved',
    metadata: {
      count: ok.length,
      target_building: targetBuildingCode,
      target_listing: targetListingId,
    },
  });

  // Revalidate every affected path
  const paths = new Set<string>(['/beithady/gallery']);
  for (const r of sources) {
    if (r.building_code) {
      paths.add(`/beithady/gallery/${r.building_code}`);
      if (r.listing_id) paths.add(`/beithady/gallery/${r.building_code}/${r.listing_id}`);
      else paths.add(`/beithady/gallery/${r.building_code}/general`);
    }
  }
  if (targetBuildingCode) {
    paths.add(`/beithady/gallery/${targetBuildingCode}`);
    if (targetListingId) paths.add(`/beithady/gallery/${targetBuildingCode}/${targetListingId}`);
    else paths.add(`/beithady/gallery/${targetBuildingCode}/general`);
  }
  for (const p of paths) revalidatePath(p);
  return { ok, failed };
}

function normalizeTags(raw: string[]): string[] {
  return Array.from(new Set(
    raw.map(t => t.toLowerCase().trim()).filter(Boolean)
  )).slice(0, 30);
}

export async function bulkTagAssetsAction(input: {
  ids: string[];
  addTags: string[];
  removeTags: string[];
}): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  const add = normalizeTags(input.addTags || []);
  const rem = new Set(normalizeTags(input.removeTags || []));
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_gallery_assets')
    .select('id, manual_tags')
    .in('id', ids)
    .is('deleted_at', null);
  const records = (rows as Array<{ id: string; manual_tags: string[] | null }> | null) || [];

  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const r of records) {
    const existing = (r.manual_tags || []).filter(t => !rem.has(t));
    const merged = Array.from(new Set([...existing, ...add])).slice(0, 30);
    const { error } = await sb
      .from('beithady_gallery_assets')
      .update({ manual_tags: merged })
      .eq('id', r.id);
    if (error) failed.push({ id: r.id, error: error.message });
    else ok.push(r.id);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_bulk_tagged',
    metadata: { count: ok.length, add_tags: add, remove_tags: Array.from(rem) },
  });
  revalidatePath('/beithady/gallery');
  return { ok, failed };
}

export async function bulkAdEligibleAction(input: {
  ids: string[];
  eligible: boolean;
}): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  const target = !!input.eligible;
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_gallery_assets')
    .select('id, storage_bucket, storage_path, ad_eligible')
    .in('id', ids)
    .is('deleted_at', null);
  const records = (rows as Array<{
    id: string; storage_bucket: string; storage_path: string; ad_eligible: boolean;
  }> | null) || [];

  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < records.length) {
      const idx = cursor++;
      const r = records[idx];
      if (r.ad_eligible === target) { ok.push(r.id); continue; }
      try {
        if (target) {
          const result = await promoteToPublic(r.storage_path);
          if (!result.ok) throw new Error(`promote_failed: ${result.error}`);
          await sb.rpc('beithady_gallery_set_ad_eligible', {
            p_asset_id: r.id, p_ad_eligible: true, p_public_url: result.publicUrl,
          });
        } else {
          await demoteFromPublic(r.storage_path);
          await sb.rpc('beithady_gallery_set_ad_eligible', {
            p_asset_id: r.id, p_ad_eligible: false, p_public_url: null,
          });
        }
        ok.push(r.id);
      } catch (e) {
        failed.push({ id: r.id, error: e instanceof Error ? e.message : 'toggle_failed' });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_bulk_ad_eligible',
    metadata: { count: ok.length, eligible: target },
  });
  revalidatePath('/beithady/gallery');
  return { ok, failed };
}

export async function nukeAlbumAction(input: {
  buildingCode: string | null;
  listingId: string | null;
  confirmation: string;
}): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const user = await requirePermission('full');
  if (input.confirmation !== 'DELETE') {
    return { ok: false, error: 'confirmation_required' };
  }

  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_gallery_assets')
    .select('id')
    .is('deleted_at', null);
  if (input.buildingCode) q = q.eq('building_code', input.buildingCode);
  else q = q.is('building_code', null);
  if (input.listingId) q = q.eq('listing_id', input.listingId);
  else q = q.is('listing_id', null);
  const { data: rows } = await q;
  const allIds = ((rows as Array<{ id: string }> | null) || []).map(r => r.id);
  if (allIds.length === 0) return { ok: true, deleted: 0 };

  // Process in chunks of 200
  let totalOk = 0;
  for (let i = 0; i < allIds.length; i += MAX_BULK_IDS) {
    const chunk = allIds.slice(i, i + MAX_BULK_IDS);
    const result = await bulkDeleteAssetsAction({ ids: chunk });
    totalOk += result.ok.length;
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'album_nuked',
    metadata: {
      building: input.buildingCode,
      listing_id: input.listingId,
      deleted: totalOk,
    },
  });
  return { ok: true, deleted: totalOk };
}
