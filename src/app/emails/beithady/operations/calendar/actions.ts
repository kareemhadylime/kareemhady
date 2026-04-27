'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { resolvePaymentForReservation } from '@/lib/beithady/operations/payment-resolver';

async function writeAudit(
  actorUserId: string,
  action: string,
  reservationId: string,
  before: unknown,
  after: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('beithady_audit_log').insert({
    actor_user_id: actorUserId,
    module: 'operations',
    action,
    target_type: 'reservation',
    target_id: reservationId,
    before: before ?? null,
    after: after ?? null,
    metadata: metadata ?? null,
  });
}

export type SavedViewFilters = {
  buildings?: string[];
  channels?: string[];
  status?: string;
  risk?: string;
  q?: string;
  days?: number;
};

export async function saveViewAction(input: {
  name: string;
  scope: 'private' | 'shared';
  filters: SavedViewFilters;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  if (!input.name || input.name.length > 80) {
    return { ok: false, error: 'Name required (max 80 chars)' };
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_calendar_saved_views')
    .insert({
      name: input.name.trim(),
      owner_user_id: user.id,
      scope: input.scope,
      filters_json: input.filters,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteViewAction(viewId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  // Owners can delete their own views; admins (handled inside requireBeithadyPermission)
  // bypass via the elevated role; but we still scope to owner_user_id for safety.
  const { error } = await sb
    .from('beithady_calendar_saved_views')
    .delete()
    .eq('id', viewId)
    .eq('owner_user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true };
}

export type SavedView = {
  id: string;
  name: string;
  scope: 'private' | 'shared';
  filters_json: SavedViewFilters;
  is_mine: boolean;
};

// =================================================================== Payment

export async function markPaidAction(input: {
  reservationId: string;
  amountUsd?: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { data: prev } = await sb
    .from('beithady_reservation_overrides')
    .select('payment_status, payment_paid_cents, payment_total_cents, payment_currency, manual_notes')
    .eq('reservation_id', input.reservationId)
    .maybeSingle();

  const totalCents = (prev as { payment_total_cents?: number | null } | null)?.payment_total_cents ?? null;
  const paidCents = input.amountUsd != null
    ? Math.round(input.amountUsd * 100)
    : totalCents ?? 0;
  const balance = totalCents != null ? Math.max(0, totalCents - paidCents) : 0;
  const status: 'paid' | 'partial' = balance === 0 ? 'paid' : 'partial';

  const { error } = await sb
    .from('beithady_reservation_overrides')
    .upsert({
      reservation_id: input.reservationId,
      payment_status: status,
      payment_paid_cents: paidCents,
      payment_balance_cents: balance,
      payment_source: 'manual',
      flagged_unpaid: false,
      manual_notes: input.note || (prev as { manual_notes?: string | null } | null)?.manual_notes,
      updated_by_user: user.id,
      last_recomputed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'reservation_id' });
  if (error) return { ok: false, error: error.message };

  await writeAudit(user.id, 'payment.mark_paid', input.reservationId, prev, {
    status, paid_cents: paidCents, balance_cents: balance,
  }, { note: input.note });

  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true };
}

export async function markUnpaidAction(input: {
  reservationId: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { data: prev } = await sb
    .from('beithady_reservation_overrides')
    .select('payment_status, payment_paid_cents, payment_total_cents')
    .eq('reservation_id', input.reservationId)
    .maybeSingle();

  const totalCents = (prev as { payment_total_cents?: number | null } | null)?.payment_total_cents ?? null;
  const { error } = await sb
    .from('beithady_reservation_overrides')
    .upsert({
      reservation_id: input.reservationId,
      payment_status: 'unpaid',
      payment_paid_cents: 0,
      payment_balance_cents: totalCents ?? 0,
      payment_source: 'manual',
      manual_notes: input.note,
      updated_by_user: user.id,
      last_recomputed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'reservation_id' });
  if (error) return { ok: false, error: error.message };

  await writeAudit(user.id, 'payment.mark_unpaid', input.reservationId, prev, {
    status: 'unpaid',
  }, { note: input.note });

  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true };
}

// Re-resolve payment status from upstream (channel data + Stripe).
// Useful when an OTA marks a reservation paid after our cache thought
// it was unpaid, or when a Stripe charge succeeds for a direct booking.
export async function recomputePaymentAction(input: {
  reservationId: string;
}): Promise<{ ok: boolean; resolution?: unknown; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  try {
    const res = await resolvePaymentForReservation(input.reservationId);
    if (!res.ok) {
      return { ok: false, error: res.message || 'resolution failed' };
    }
    const { error } = await sb
      .from('beithady_reservation_overrides')
      .upsert({
        reservation_id: input.reservationId,
        payment_status: res.status,
        payment_paid_cents: res.paid_cents,
        payment_total_cents: res.total_cents,
        payment_balance_cents: res.balance_cents,
        payment_currency: res.currency,
        payment_source: res.source === 'channel' ? 'channel' : res.source === 'stripe' ? 'stripe' : 'guesty',
        flagged_unpaid: res.status === 'unpaid' || res.status === 'partial',
        last_recomputed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'reservation_id' });
    if (error) return { ok: false, error: error.message };
    await writeAudit(user.id, 'payment.recompute', input.reservationId, null, res, {
      stripe_pi: res.stripe_payment_intent_id,
    });
    revalidatePath('/emails/beithady/operations/calendar');
    return { ok: true, resolution: res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// =================================================================== Saved views

export async function listViews(): Promise<SavedView[]> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_calendar_saved_views')
    .select('id, name, scope, filters_json, owner_user_id')
    .or(`owner_user_id.eq.${user.id},scope.eq.shared`)
    .order('name');
  return ((data as Array<{
    id: string;
    name: string;
    scope: 'private' | 'shared';
    filters_json: SavedViewFilters;
    owner_user_id: string;
  }> | null) || []).map(v => ({
    id: v.id,
    name: v.name,
    scope: v.scope,
    filters_json: v.filters_json || {},
    is_mine: v.owner_user_id === user.id,
  }));
}
