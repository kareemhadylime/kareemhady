'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, sOrNull, normPhone } from '@/lib/boat-rental/server-helpers';

export async function createOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const name = s(formData.get('name'));
  const whatsapp = normPhone(s(formData.get('whatsapp')));
  const email = sOrNull(formData.get('email'));
  const notes = sOrNull(formData.get('notes'));
  if (!name || whatsapp.length < 9) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_owners').insert({ name, whatsapp, email, notes });
  revalidatePath('/emails/boat-rental/admin/owners');
}

export async function updateOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  const whatsapp = normPhone(s(formData.get('whatsapp')));
  const email = sOrNull(formData.get('email'));
  const notes = sOrNull(formData.get('notes'));
  const status = s(formData.get('status'));
  if (!id || !name || whatsapp.length < 9) return;
  if (!['active', 'inactive'].includes(status)) return;
  const sb = supabaseAdmin();
  await sb
    .from('boat_rental_owners')
    .update({ name, whatsapp, email, notes, status, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/emails/boat-rental/admin/owners');
}

export async function deleteOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  // Reject delete if any boat still references this owner.
  const { count } = await sb
    .from('boat_rental_boats')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', id);
  if ((count || 0) > 0) {
    // Soft-archive instead of hard delete.
    await sb
      .from('boat_rental_owners')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id);
  } else {
    await sb.from('boat_rental_owners').delete().eq('id', id);
  }
  revalidatePath('/emails/boat-rental/admin/owners');
}
