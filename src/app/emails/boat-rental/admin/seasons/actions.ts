'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s } from '@/lib/boat-rental/server-helpers';

function validDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function createSeasonAction(formData: FormData) {
  await requireBoatAdmin();
  const name = s(formData.get('name'));
  const start = s(formData.get('start_date'));
  const end = s(formData.get('end_date'));
  if (!name || !validDate(start) || !validDate(end) || end < start) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_seasons').insert({ name, start_date: start, end_date: end });
  revalidatePath('/emails/boat-rental/admin/seasons');
}

export async function updateSeasonAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  const start = s(formData.get('start_date'));
  const end = s(formData.get('end_date'));
  if (!id || !name || !validDate(start) || !validDate(end) || end < start) return;
  const sb = supabaseAdmin();
  await sb
    .from('boat_rental_seasons')
    .update({ name, start_date: start, end_date: end })
    .eq('id', id);
  revalidatePath('/emails/boat-rental/admin/seasons');
}

export async function deleteSeasonAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_seasons').delete().eq('id', id);
  revalidatePath('/emails/boat-rental/admin/seasons');
}
