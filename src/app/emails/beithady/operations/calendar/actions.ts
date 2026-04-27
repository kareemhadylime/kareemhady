'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { resolvePaymentForReservation } from '@/lib/beithady/operations/payment-resolver';
import { blockGuestyAvailability, unblockGuestyAvailability } from '@/lib/beithady/operations/guesty-writes';

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

// =================================================================== Boarding pass

export async function getBoardingPassUrlAction(input: {
  reservationId: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_boarding_passes')
    .select('token, expires_at')
    .eq('reservation_id', input.reservationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: false, error: 'No boarding pass exists yet for this reservation' };
  const row = data as { token: string; expires_at: string | null };
  // App-relative path; client builds the absolute URL with location.origin
  return { ok: true, url: `/boarding/${row.token}` };
}

// =================================================================== Manual blocks

export async function createManualBlockAction(input: {
  listingId: string;
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD (exclusive)
  reason: 'owner_stay' | 'maintenance' | 'hold' | 'other';
  notes?: string;
  forceOverride?: boolean; // skip overbooking guard
}): Promise<{ ok: boolean; id?: string; guestySync?: boolean; guestyError?: string; error?: string; conflict?: { reservation_id: string; guest_name: string | null; channel: string | null; check_in: string; check_out: string } }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  if (input.endDate <= input.startDate) {
    return { ok: false, error: 'End date must be after start date' };
  }
  const sb = supabaseAdmin();

  // Pre-write overbooking guard (J.8): re-check the latest reservation
  // state for this listing across the requested window. If a confirmed
  // reservation overlaps, refuse unless caller passed forceOverride.
  if (!input.forceOverride) {
    const { data: conflicts } = await sb
      .from('beithady_reservation_grid_v')
      .select('reservation_id, guest_name, channel, check_in_date, check_out_date, status')
      .eq('listing_id', input.listingId)
      .neq('status', 'canceled')
      .lt('check_in_date', input.endDate)
      .gt('check_out_date', input.startDate)
      .limit(1);
    const hit = (conflicts as Array<{ reservation_id: string; guest_name: string | null; channel: string | null; check_in_date: string; check_out_date: string }> | null)?.[0];
    if (hit) {
      return {
        ok: false,
        error: 'Overbooking conflict — a reservation overlaps the requested block window.',
        conflict: {
          reservation_id: hit.reservation_id,
          guest_name: hit.guest_name,
          channel: hit.channel,
          check_in: hit.check_in_date,
          check_out: hit.check_out_date,
        },
      };
    }
  }

  // 1) Insert local block first — local always wins, sync is best-effort.
  const { data: created, error: insErr } = await sb
    .from('beithady_calendar_manual_blocks')
    .insert({
      listing_id: input.listingId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason: input.reason,
      notes: input.notes,
      created_by_user: user.id,
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: insErr.message };
  const blockId = (created as { id: string }).id;

  // 2) Push to Guesty (best effort).
  const sync = await blockGuestyAvailability({
    listingId: input.listingId,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    note: input.notes,
  });
  await sb
    .from('beithady_calendar_manual_blocks')
    .update({
      guesty_synced: sync.ok,
      guesty_synced_at: sync.ok ? new Date().toISOString() : null,
      guesty_sync_error: sync.ok ? null : sync.error || 'unknown error',
    })
    .eq('id', blockId);

  await writeAudit(user.id, 'block.create', input.listingId, null, {
    block_id: blockId,
    start: input.startDate,
    end: input.endDate,
    reason: input.reason,
    guesty_synced: sync.ok,
  }, { notes: input.notes });

  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true, id: blockId, guestySync: sync.ok, guestyError: sync.error };
}

export async function removeManualBlockAction(input: {
  blockId: string;
}): Promise<{ ok: boolean; guestySync?: boolean; guestyError?: string; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { data: block } = await sb
    .from('beithady_calendar_manual_blocks')
    .select('listing_id, start_date, end_date, reason')
    .eq('id', input.blockId)
    .maybeSingle();
  if (!block) return { ok: false, error: 'Block not found' };
  const b = block as { listing_id: string; start_date: string; end_date: string; reason: string };

  // 1) Reopen availability in Guesty (best effort).
  const sync = await unblockGuestyAvailability({
    listingId: b.listing_id,
    startDate: b.start_date,
    endDate: b.end_date,
  });

  // 2) Delete the local row.
  const { error: delErr } = await sb
    .from('beithady_calendar_manual_blocks')
    .delete()
    .eq('id', input.blockId);
  if (delErr) return { ok: false, error: delErr.message };

  await writeAudit(user.id, 'block.remove', b.listing_id, b, null, {
    block_id: input.blockId,
    guesty_synced: sync.ok,
  });

  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true, guestySync: sync.ok, guestyError: sync.error };
}

export async function listManualBlocksForWindow(input: {
  startDate: string;
  endDate: string;
  buildingCodes?: string[];
}): Promise<Array<{
  id: string;
  listing_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  notes: string | null;
  guesty_synced: boolean;
  guesty_sync_error: string | null;
}>> {
  await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_calendar_manual_blocks')
    .select('id, listing_id, start_date, end_date, reason, notes, guesty_synced, guesty_sync_error')
    .gte('end_date', input.startDate)
    .lte('start_date', input.endDate);
  if (input.buildingCodes && input.buildingCodes.length > 0) {
    // Join via guesty_listings would be cleaner; for V1 we filter by listing_id
    // membership using a sub-select.
    const { data: listings } = await sb
      .from('guesty_listings')
      .select('id')
      .in('building_code', input.buildingCodes);
    const ids = (listings as Array<{ id: string }> | null)?.map(l => l.id) || [];
    q = q.in('listing_id', ids);
  }
  const { data } = await q;
  return (data as Array<{
    id: string;
    listing_id: string;
    start_date: string;
    end_date: string;
    reason: string;
    notes: string | null;
    guesty_synced: boolean;
    guesty_sync_error: string | null;
  }> | null) || [];
}

// =================================================================== Find availability

export type AvailableUnit = {
  listing_id: string;
  nickname: string;
  building_code: string | null;
  bedrooms: number | null;
  base_price_usd: number | null;
  cover_url: string | null;
};

export async function findAvailabilityAction(input: {
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD (exclusive)
  bedrooms?: number;       // optional minimum
  buildingCodes?: string[];
}): Promise<{ ok: boolean; units?: AvailableUnit[]; error?: string }> {
  await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  if (input.endDate <= input.startDate) {
    return { ok: false, error: 'End date must be after start date' };
  }

  // 1) All bookable atoms (master_listing_id IS NULL after MTL backfill).
  let listingsQ = sb
    .from('guesty_listings')
    .select('id, nickname, building_code, master_listing_id')
    .eq('active', true)
    .is('master_listing_id', null);
  if (input.buildingCodes && input.buildingCodes.length > 0) {
    listingsQ = listingsQ.in('building_code', input.buildingCodes);
  }
  const { data: listings } = await listingsQ;
  const all = (listings as Array<{ id: string; nickname: string | null; building_code: string | null }> | null) || [];

  // 2) Reservations overlapping the window — exclude these listings.
  const { data: occupied } = await sb
    .from('guesty_reservations')
    .select('listing_id')
    .neq('status', 'canceled')
    .lt('check_in_date', input.endDate)
    .gt('check_out_date', input.startDate);
  const taken = new Set<string>();
  for (const r of (occupied as Array<{ listing_id: string }> | null) || []) {
    taken.add(r.listing_id);
  }

  // 3) Manual blocks overlapping the window — also exclude.
  const { data: blocks } = await sb
    .from('beithady_calendar_manual_blocks')
    .select('listing_id')
    .lt('start_date', input.endDate)
    .gt('end_date', input.startDate);
  for (const b of (blocks as Array<{ listing_id: string }> | null) || []) {
    taken.add(b.listing_id);
  }

  const freeIds = all.filter(l => !taken.has(l.id)).map(l => l.id);

  // 4) Pricelabs metadata for bedrooms + price.
  const { data: pricelabs } = freeIds.length > 0
    ? await sb
        .from('pricelabs_listings')
        .select('id, bedrooms')
        .in('id', freeIds)
    : { data: [] };
  const bedroomsByListing = new Map<string, number>();
  for (const r of (pricelabs as Array<{ id: string; bedrooms: number | null }> | null) || []) {
    if (r.bedrooms != null) bedroomsByListing.set(r.id, r.bedrooms);
  }

  const { data: prices } = freeIds.length > 0
    ? await sb
        .from('pricelabs_listing_snapshots')
        .select('listing_id, recommended_base_price, base, snapshot_date')
        .in('listing_id', freeIds)
        .order('snapshot_date', { ascending: false })
    : { data: [] };
  const priceByListing = new Map<string, number>();
  for (const r of (prices as Array<{
    listing_id: string;
    recommended_base_price: number | null;
    base: number | null;
  }> | null) || []) {
    if (priceByListing.has(r.listing_id)) continue;
    const v = r.recommended_base_price ?? r.base;
    if (v != null) priceByListing.set(r.listing_id, Number(v));
  }

  // 5) Cover thumbnails (best effort)
  const { data: covers } = freeIds.length > 0
    ? await sb
        .from('beithady_gallery_assets')
        .select('listing_id, public_url')
        .in('listing_id', freeIds)
        .eq('category', 'photo')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
    : { data: [] };
  const coverByListing = new Map<string, string>();
  for (const r of (covers as Array<{ listing_id: string; public_url: string | null }> | null) || []) {
    if (coverByListing.has(r.listing_id)) continue;
    if (r.public_url) coverByListing.set(r.listing_id, r.public_url);
  }

  // Apply bedroom filter if provided
  let units: AvailableUnit[] = all
    .filter(l => !taken.has(l.id))
    .map(l => ({
      listing_id: l.id,
      nickname: l.nickname || l.id,
      building_code: l.building_code,
      bedrooms: bedroomsByListing.get(l.id) ?? null,
      base_price_usd: priceByListing.get(l.id) ?? null,
      cover_url: coverByListing.get(l.id) || null,
    }));
  if (input.bedrooms != null) {
    units = units.filter(u => u.bedrooms != null && u.bedrooms >= input.bedrooms!);
  }

  units.sort((a, b) => a.nickname.localeCompare(b.nickname));
  return { ok: true, units };
}

// =================================================================== Bulk

export async function bulkSendPreArrivalAction(input: {
  daysAhead?: number;       // default 3
  buildingCodes?: string[];
  dryRun?: boolean;
}): Promise<{ ok: boolean; matched: number; skipped: number; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const days = input.daysAhead ?? 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() + days * 86400000);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  // Find reservations arriving in [today, today+days] that DO NOT have
  // a pre-arrival message yet.
  let q = sb
    .from('beithady_reservation_grid_v')
    .select('reservation_id, listing_id, building_code, prearrival_sent_at, status')
    .gte('check_in_date', todayIso)
    .lte('check_in_date', cutoffIso)
    .is('prearrival_sent_at', null)
    .neq('status', 'canceled');
  if (input.buildingCodes && input.buildingCodes.length > 0) {
    q = q.in('building_code', input.buildingCodes);
  }
  const { data, error } = await q;
  if (error) return { ok: false, matched: 0, skipped: 0, error: error.message };

  const rows = (data as Array<{ reservation_id: string }> | null) || [];

  if (input.dryRun) {
    return { ok: true, matched: rows.length, skipped: 0 };
  }

  // Insert placeholder pre_arrival_messages rows. The
  // /api/cron/beithady-pre-arrival cron picks these up on its next tick
  // and actually sends. This avoids us hammering the messaging API
  // synchronously in a server action.
  let skipped = 0;
  for (const r of rows) {
    const { error: e } = await sb.from('beithady_pre_arrival_messages').insert({
      reservation_id: r.reservation_id,
      scheduled_for: new Date().toISOString(),
    });
    if (e) skipped += 1;
  }

  await writeAudit(user.id, 'bulk.send_prearrival', 'bulk', null, {
    matched: rows.length,
    skipped,
    days_ahead: days,
    buildings: input.buildingCodes,
  });

  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true, matched: rows.length - skipped, skipped };
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
