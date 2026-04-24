'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s } from '@/lib/boat-rental/server-helpers';

export async function createDestinationAction(formData: FormData) {
  await requireBoatAdmin();
  const name = s(formData.get('name'));
  if (!name) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_destinations').insert({ name, active: true });
  revalidatePath('/emails/boat-rental/admin/destinations');
}

export async function toggleDestinationAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const active = s(formData.get('active')) === '1';
  if (!id) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_destinations').update({ active: !active }).eq('id', id);
  revalidatePath('/emails/boat-rental/admin/destinations');
}

export async function renameDestinationAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  if (!id || !name) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_destinations').update({ name }).eq('id', id);
  revalidatePath('/emails/boat-rental/admin/destinations');
}

export async function deleteDestinationAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  // If any booking references this destination, soft-disable instead.
  const { count } = await sb
    .from('boat_rental_bookings')
    .select('reservation_id', { count: 'exact', head: true })
    .eq('destination_id', id);
  if ((count || 0) > 0) {
    await sb.from('boat_rental_destinations').update({ active: false }).eq('id', id);
  } else {
    await sb.from('boat_rental_destinations').delete().eq('id', id);
  }
  revalidatePath('/emails/boat-rental/admin/destinations');
}
