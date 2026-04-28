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
