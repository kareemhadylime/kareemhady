'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, sOrNull, nOrNull, normPhone } from '@/lib/boat-rental/server-helpers';
import { isValidFeatureCode } from '@/lib/boat-rental/features';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { classifyBoatPhoto } from '@/lib/boat-rental/photo-classifier';
import { PHOTO_CATEGORIES, type PhotoCategory } from '@/lib/boat-rental/photo-categories';

// Pull every 'features' value from the form, dedupe, and drop anything
// that's not in the predefined registry. Defends against tampered
// submissions while letting us add/remove features in code without
// breaking saved boats.
function readFeatures(formData: FormData): string[] {
  const raw = formData.getAll('features').map(v => String(v));
  return Array.from(new Set(raw)).filter(isValidFeatureCode);
}

// Image uploads no longer flow through Server Actions because Vercel
// caps Server Action request bodies at ~4.5MB and multi-image submits
// blew past that. Photos are now uploaded directly to Supabase Storage
// via signed URLs (see /api/boat-rental/admin/boat-image/sign and
// /attach + the BoatImageUploader client component on the boat detail
// page). createBoatAction below stays text-only.

const BUCKET = 'boat-rental';

function readHull(formData: FormData): 'wood' | 'fiberglass' | null {
  const v = s(formData.get('hull'));
  return v === 'wood' || v === 'fiberglass' ? v : null;
}

export async function createBoatAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const name = s(formData.get('name'));
  const size = sOrNull(formData.get('size'));
  const hull = readHull(formData);
  const description = sOrNull(formData.get('description'));
  const features_md = sOrNull(formData.get('features_md'));
  const features = readFeatures(formData);
  const capacity_guests = nOrNull(formData.get('capacity_guests'));
  const owner_id = s(formData.get('owner_id'));
  const skipper_name = s(formData.get('skipper_name'));
  const skipper_whatsapp = normPhone(s(formData.get('skipper_whatsapp')));
  if (!name || !owner_id || !skipper_name || skipper_whatsapp.length < 9 || !capacity_guests || capacity_guests < 1) {
    throw new Error('invalid_input');
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('boat_rental_boats')
    .insert({ name, size, hull, description, features_md, features, capacity_guests, owner_id, skipper_name, skipper_whatsapp })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'create_failed');
  const boatId = (data as { id: string }).id;

  // No image handling here — the user lands on the detail page, which
  // hosts the direct-upload widget (BoatImageUploader).

  revalidatePath('/emails/boat-rental/admin/boats');
  redirect(`/emails/boat-rental/admin/boats/${boatId}`);
}

export async function updateBoatAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  const size = sOrNull(formData.get('size'));
  const hull = readHull(formData);
  const description = sOrNull(formData.get('description'));
  const features_md = sOrNull(formData.get('features_md'));
  const features = readFeatures(formData);
  const capacity_guests = nOrNull(formData.get('capacity_guests'));
  const owner_id = s(formData.get('owner_id'));
  const skipper_name = s(formData.get('skipper_name'));
  const skipper_whatsapp = normPhone(s(formData.get('skipper_whatsapp')));
  const status = s(formData.get('status'));
  if (
    !id ||
    !name ||
    !owner_id ||
    !skipper_name ||
    skipper_whatsapp.length < 9 ||
    !capacity_guests ||
    capacity_guests < 1 ||
    !['active', 'maintenance', 'inactive'].includes(status)
  ) {
    throw new Error('invalid_input');
  }
  const sb = supabaseAdmin();
  await sb
    .from('boat_rental_boats')
    .update({
      name,
      size,
      hull,
      description,
      features_md,
      features,
      capacity_guests,
      owner_id,
      skipper_name,
      skipper_whatsapp,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  revalidatePath(`/emails/boat-rental/admin/boats/${id}`);
  revalidatePath('/emails/boat-rental/admin/boats');
  revalidatePath('/emails/boat-rental/broker/inventory');
  revalidatePath('/emails/boat-rental/owner/inventory');
  revalidatePath('/emails/boat-rental/admin/inventory');
}

// uploadBoatImagesAction was removed — replaced by client-direct upload via
// /api/boat-rental/admin/boat-image/sign + /attach. Kept the helper export
// commented for reference only.

// Sets a single photo as the boat's main/primary image. Used by the
// catalogue grid preview, catalogue-detail hero, and PDF hero. The
// uniqueness invariant (one primary per boat) is enforced by the
// partial unique index in migration 0023; we still clear-then-set
// here so the index never fires a 23505.
export async function setPrimaryBoatImageAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const boatId = s(formData.get('boat_id'));
  if (!id || !boatId) return;
  const sb = supabaseAdmin();
  // Clear any existing primary on this boat, then set the new one.
  await sb
    .from('boat_rental_boat_images')
    .update({ is_primary: false })
    .eq('boat_id', boatId)
    .eq('is_primary', true);
  await sb
    .from('boat_rental_boat_images')
    .update({ is_primary: true })
    .eq('id', id);
  revalidatePath(`/emails/boat-rental/admin/boats/${boatId}`);
  revalidatePath('/emails/boat-rental/admin/boats');
  revalidatePath('/emails/boat-rental/broker/inventory');
  revalidatePath('/emails/boat-rental/owner/inventory');
  revalidatePath('/emails/boat-rental/admin/inventory');
}

// Move a photo up or down in the boat's gallery by swapping its
// sort_order with the nearest neighbor. The neighbor is whichever
// photo currently sits at sort_order +/-1 — if the boat has gaps in
// numbering (deleted middle row, etc.), this still does the right
// thing because we sort the live list and pick the actual neighbor.
export async function moveBoatImageAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const boatId = s(formData.get('boat_id'));
  const direction = s(formData.get('direction'));
  if (!id || !boatId || !['up', 'down'].includes(direction)) return;

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('boat_rental_boat_images')
    .select('id, sort_order')
    .eq('boat_id', boatId)
    .order('sort_order');
  const list = (rows as Array<{ id: string; sort_order: number }> | null) || [];
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return;

  const a = list[idx];
  const b = list[swapIdx];
  // Two-step swap to avoid colliding with any future unique constraint
  // on (boat_id, sort_order).
  await sb.from('boat_rental_boat_images').update({ sort_order: -1 }).eq('id', a.id);
  await sb.from('boat_rental_boat_images').update({ sort_order: a.sort_order }).eq('id', b.id);
  await sb.from('boat_rental_boat_images').update({ sort_order: b.sort_order }).eq('id', a.id);

  revalidatePath(`/emails/boat-rental/admin/boats/${boatId}`);
  revalidatePath('/emails/boat-rental/broker/inventory');
  revalidatePath('/emails/boat-rental/owner/inventory');
  revalidatePath('/emails/boat-rental/admin/inventory');
}

// Manual override for the AI's category guess. Allow null (clear) so
// admin can wipe a wrong tag and let the next backfill re-pick.
export async function setBoatImageCategoryAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const boatId = s(formData.get('boat_id'));
  const raw = s(formData.get('category'));
  if (!id || !boatId) return;
  const category = (PHOTO_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as PhotoCategory)
    : null;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_boat_images').update({ category }).eq('id', id);
  revalidatePath(`/emails/boat-rental/admin/boats/${boatId}`);
  revalidatePath('/emails/boat-rental/broker/inventory');
  revalidatePath('/emails/boat-rental/owner/inventory');
  revalidatePath('/emails/boat-rental/admin/inventory');
}

// Re-runs the Claude vision classifier on every photo for this boat
// that doesn't yet have a category. Sequential to keep the function
// well within Vercel's 60s budget; ~1-2s per photo on Haiku 4.5.
export async function backfillBoatPhotosClassificationAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const boatId = s(formData.get('boat_id'));
  if (!boatId) return;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_boat_images')
    .select('id, storage_path, category')
    .eq('boat_id', boatId)
    .is('category', null);
  const rows = ((data as unknown) as Array<{ id: string; storage_path: string }> | null) || [];
  for (const r of rows) {
    const url = await signedImageUrl(r.storage_path);
    if (!url) continue;
    const cat = await classifyBoatPhoto(url);
    if (cat) {
      await sb.from('boat_rental_boat_images').update({ category: cat }).eq('id', r.id);
    }
  }
  revalidatePath(`/emails/boat-rental/admin/boats/${boatId}`);
  revalidatePath('/emails/boat-rental/broker/inventory');
  revalidatePath('/emails/boat-rental/owner/inventory');
  revalidatePath('/emails/boat-rental/admin/inventory');
}

export async function deleteBoatImageAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const boatId = s(formData.get('boat_id'));
  if (!id) return;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_boat_images')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  const row = data as { storage_path: string } | null;
  if (row?.storage_path) {
    await sb.storage.from(BUCKET).remove([row.storage_path]);
  }
  await sb.from('boat_rental_boat_images').delete().eq('id', id);
  revalidatePath(`/emails/boat-rental/admin/boats/${boatId}`);
}

export async function deleteBoatAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  // Refuse hard-delete if boat has any reservation history — archive instead.
  const { count } = await sb
    .from('boat_rental_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('boat_id', id);
  if ((count || 0) > 0) {
    await sb
      .from('boat_rental_boats')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id);
  } else {
    // Best-effort clean up images first.
    const { data: imgs } = await sb
      .from('boat_rental_boat_images')
      .select('storage_path')
      .eq('boat_id', id);
    const paths = ((imgs as Array<{ storage_path: string }> | null) || []).map(r => r.storage_path);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    await sb.from('boat_rental_boats').delete().eq('id', id);
  }
  revalidatePath('/emails/boat-rental/admin/boats');
  redirect('/emails/boat-rental/admin/boats');
}
