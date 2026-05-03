'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  logAudit,
} from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import type { SessionUser } from '@/lib/auth';

const phoneSchema = z.string().regex(/^\d{8,15}$/, 'WhatsApp must be E.164 digits without +');

async function assertOwnerOwnsBoat(boatId: string, user: SessionUser): Promise<void> {
  const ownerIds = await getOwnedOwnerIds(user);
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_boats')
    .select('owner_id')
    .eq('id', boatId)
    .maybeSingle();
  if (!data || !ownerIds.includes((data as { owner_id: string }).owner_id)) {
    throw new Error('forbidden');
  }
}

export async function addSkipperAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const boatId = s(formData.get('boat_id'));
  const name = s(formData.get('name'));
  const whatsapp = s(formData.get('whatsapp'));
  const isDefault = formData.get('is_default') === 'on';
  const notes = sOrNull(formData.get('notes'));
  if (!boatId || !name) throw new Error('invalid_input');
  phoneSchema.parse(whatsapp);
  await assertOwnerOwnsBoat(boatId, me);

  const sb = supabaseAdmin();
  if (isDefault) {
    // Atomically unset the existing default first
    await sb
      .from('boat_rental_skippers')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('boat_id', boatId)
      .eq('is_default', true);
  }

  // If this is the first skipper for the boat, force is_default=true
  const { count } = await sb
    .from('boat_rental_skippers')
    .select('id', { count: 'exact', head: true })
    .eq('boat_id', boatId);
  const forceDefault = (count ?? 0) === 0;

  const { data, error } = await sb
    .from('boat_rental_skippers')
    .insert({
      boat_id: boatId,
      name,
      whatsapp,
      is_default: isDefault || forceDefault,
      active: true,
      notes,
    })
    .select('id')
    .single();
  if (error) throw error;
  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'skipper_add',
    payload: { skipper_id: (data as { id: string }).id, boat_id: boatId, is_default: isDefault || forceDefault },
  });
  revalidatePath('/emails/boat-rental/owner/skippers');
}

export async function setDefaultSkipperAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_skippers')
    .select('boat_id')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new Error('not_found');
  const boatId = (row as { boat_id: string }).boat_id;
  await assertOwnerOwnsBoat(boatId, me);

  // Unset previous default + set new default in two atomic statements.
  await sb
    .from('boat_rental_skippers')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('boat_id', boatId)
    .eq('is_default', true);
  await sb
    .from('boat_rental_skippers')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'skipper_set_default',
    payload: { skipper_id: id, boat_id: boatId },
  });
  revalidatePath('/emails/boat-rental/owner/skippers');
}

export async function deactivateSkipperAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_skippers')
    .select('boat_id, is_default')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new Error('not_found');
  const skipper = row as { boat_id: string; is_default: boolean };
  if (skipper.is_default) {
    throw new Error('cannot_deactivate_default — promote another skipper first');
  }
  await assertOwnerOwnsBoat(skipper.boat_id, me);

  await sb
    .from('boat_rental_skippers')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'skipper_deactivate',
    payload: { skipper_id: id },
  });
  revalidatePath('/emails/boat-rental/owner/skippers');
}

export async function editSkipperAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  const name = s(formData.get('name'));
  const whatsapp = s(formData.get('whatsapp'));
  if (!id || !name) throw new Error('invalid_input');
  phoneSchema.parse(whatsapp);

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_skippers')
    .select('boat_id')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new Error('not_found');
  await assertOwnerOwnsBoat((row as { boat_id: string }).boat_id, me);

  await sb
    .from('boat_rental_skippers')
    .update({ name, whatsapp, updated_at: new Date().toISOString() })
    .eq('id', id);

  revalidatePath('/emails/boat-rental/owner/skippers');
}
