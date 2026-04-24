'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, sOrNull, nOrNull, normPhone } from '@/lib/boat-rental/server-helpers';

const BUCKET = 'boat-rental';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per image
const MAX_IMAGES_PER_BOAT = 10;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

async function uploadImages(boatId: string, files: File[]): Promise<number> {
  if (!files.length) return 0;
  const sb = supabaseAdmin();
  const { count: existingCount } = await sb
    .from('boat_rental_boat_images')
    .select('id', { count: 'exact', head: true })
    .eq('boat_id', boatId);

  let slotsLeft = MAX_IMAGES_PER_BOAT - (existingCount || 0);
  let uploaded = 0;
  for (const f of files) {
    if (slotsLeft <= 0) break;
    if (!IMAGE_MIMES.has(f.type)) continue;
    if (f.size === 0 || f.size > MAX_IMAGE_BYTES) continue;
    const key = `boats/${boatId}/${crypto.randomUUID()}.${extFor(f.type)}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const up = await sb.storage.from(BUCKET).upload(key, buf, {
      contentType: f.type,
      upsert: false,
    });
    if (up.error) continue;
    await sb.from('boat_rental_boat_images').insert({
      boat_id: boatId,
      storage_path: key,
      sort_order: (existingCount || 0) + uploaded,
    });
    uploaded++;
    slotsLeft--;
  }
  return uploaded;
}

export async function createBoatAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const name = s(formData.get('name'));
  const size = sOrNull(formData.get('size'));
  const features_md = sOrNull(formData.get('features_md'));
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
    .insert({ name, size, features_md, capacity_guests, owner_id, skipper_name, skipper_whatsapp })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'create_failed');
  const boatId = (data as { id: string }).id;

  // Handle any images posted alongside create.
  const files = formData.getAll('images').filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length) await uploadImages(boatId, files);

  revalidatePath('/emails/boat-rental/admin/boats');
  redirect(`/emails/boat-rental/admin/boats/${boatId}`);
}

export async function updateBoatAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  const size = sOrNull(formData.get('size'));
  const features_md = sOrNull(formData.get('features_md'));
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
      features_md,
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
}

export async function uploadBoatImagesAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const boatId = s(formData.get('boat_id'));
  if (!boatId) return;
  const files = formData.getAll('images').filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length) await uploadImages(boatId, files);
  revalidatePath(`/emails/boat-rental/admin/boats/${boatId}`);
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
