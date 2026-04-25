'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, sOrNull, nOrNull, normPhone } from '@/lib/boat-rental/server-helpers';
import { isValidFeatureCode } from '@/lib/boat-rental/features';

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
