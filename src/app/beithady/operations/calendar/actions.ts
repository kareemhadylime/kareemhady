'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { resolvePaymentForReservation } from '@/lib/beithady/operations/payment-resolver';
import { blockGuestyAvailability, unblockGuestyAvailability } from '@/lib/beithady/operations/guesty-writes';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { isAutomationPaused } from '@/lib/beithady/automations';

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
  revalidatePath('/beithady/operations/calendar');
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
  revalidatePath('/beithady/operations/calendar');
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

  revalidatePath('/beithady/operations/calendar');
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

  revalidatePath('/beithady/operations/calendar');
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
    revalidatePath('/beithady/operations/calendar');
    return { ok: true, resolution: res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// =================================================================== Re-confirmation (Phase K.2 cancel-risk workflow)

export async function sendReconfirmationAction(input: {
  reservationId: string;
  customMessage?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  // Phase C.5 follow-up — granular kill switch.
  if (await isAutomationPaused('cancel_risk_reconfirm')) {
    return { ok: false, error: 'cancel_risk_reconfirm_paused' };
  }
  const sb = supabaseAdmin();
  const { data: r } = await sb
    .from('beithady_reservation_grid_v')
    .select('reservation_id, listing_nickname, guest_name, guest_phone, check_in_date, check_out_date, nights')
    .eq('reservation_id', input.reservationId)
    .maybeSingle();
  if (!r) return { ok: false, error: 'Reservation not found' };
  const row = r as { listing_nickname: string | null; guest_name: string | null; guest_phone: string | null; check_in_date: string; check_out_date: string; nights: number | null };

  const greet = row.guest_name ? `Hi ${row.guest_name}` : 'Hello';
  const unit = row.listing_nickname ? ` at ${row.listing_nickname}` : '';
  const message = input.customMessage
    || `${greet}! Just confirming your upcoming stay${unit} from ${row.check_in_date} to ${row.check_out_date} (${row.nights} night${row.nights === 1 ? '' : 's'}). Reply YES to confirm, or message us if any of your plans have changed. — Beit Hady`;

  // Phase C.5 — improvement #9: fallback to email-via-Guesty when phone
  // is missing AND BEITHADY_CANCEL_FALLBACK=true. Default off (R10) so
  // existing behavior is preserved until the env flag is flipped.
  const fallbackEnabled = process.env.BEITHADY_CANCEL_FALLBACK === 'true';
  const phone = row.guest_phone ? row.guest_phone.replace(/[^\d]/g, '') : null;

  let usedFallback = false;
  let viaChannel: 'wa_casual' | 'guesty_email' = 'wa_casual';

  if (phone) {
    const result = await sendWhatsApp({ to: phone, message });
    if (!result.ok) return { ok: false, error: result.error };
  } else if (fallbackEnabled) {
    // Look up an active Guesty conversation linked to this reservation
    // (or matching the guest_id) so we can inject a module=email post.
    const { data: convRow } = await sb
      .from('beithady_conversations')
      .select('id, channel, guest_email')
      .eq('reservation_id', input.reservationId)
      .eq('channel', 'guesty')
      .is('archived_at', null)
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!convRow || !(convRow as { guest_email: string | null }).guest_email) {
      return { ok: false, error: 'No phone and no email-capable Guesty conversation on file' };
    }
    const conv = convRow as { id: string };
    const { sendGuestyMessage } = await import('@/lib/beithady/communication/send-guesty');
    const fb = await sendGuestyMessage({
      beithadyConversationId: conv.id,
      body: message,
      module: 'email',
      subject: `Re-confirming your stay${unit ? ` at${unit}` : ''}`,
      agentUserId: user.id,
    });
    if (!fb.ok) return { ok: false, error: `email_fallback_failed: ${fb.error}` };
    usedFallback = true;
    viaChannel = 'guesty_email';
  } else {
    return { ok: false, error: 'No guest phone number on file' };
  }

  await sb
    .from('beithady_reservation_overrides')
    .upsert({
      reservation_id: input.reservationId,
      last_reconfirmation_sent_at: new Date().toISOString(),
      reconfirmation_response: 'no_response',
      updated_by_user: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'reservation_id' });

  await writeAudit(user.id, 'reconfirmation.send', input.reservationId, null, {
    via: viaChannel,
    used_fallback: usedFallback,
    phone: phone || null,
    message_preview: message.slice(0, 80),
  });

  // Trigger immediate recompute so the score drops
  await sb.rpc('beithady_calendar_recompute_cancel_risk', { p_reservation_id: input.reservationId });

  revalidatePath('/beithady/operations/cancel-risk');
  revalidatePath('/beithady/operations/calendar');
  return { ok: true };
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

  revalidatePath('/beithady/operations/calendar');
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

  revalidatePath('/beithady/operations/calendar');
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
    // Filter listings by building, where 'OTHER' = building_code IS NULL.
    const wanted = input.buildingCodes;
    const includeOther = wanted.includes('OTHER');
    const namedOnly = wanted.filter(b => b !== 'OTHER');
    let lq = sb.from('guesty_listings').select('id');
    if (namedOnly.length > 0 && !includeOther) {
      lq = lq.in('building_code', namedOnly);
    } else if (namedOnly.length > 0 && includeOther) {
      const inExpr = namedOnly.map(b => `building_code.eq.${b}`).join(',');
      lq = lq.or(`${inExpr},building_code.is.null`);
    } else if (includeOther) {
      lq = lq.is('building_code', null);
    }
    const { data: listings } = await lq;
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
  // 'OTHER' is a synthetic bucket for listings with NULL building_code.
  const wanted = input.buildingCodes || [];
  const includeOther = wanted.length === 0 || wanted.includes('OTHER');
  const namedOnly = wanted.filter(b => b !== 'OTHER');

  let listingsQ = sb
    .from('guesty_listings')
    .select('id, nickname, building_code, master_listing_id')
    .eq('active', true)
    .is('master_listing_id', null);
  if (namedOnly.length > 0 && !includeOther) {
    listingsQ = listingsQ.in('building_code', namedOnly);
  } else if (namedOnly.length > 0 && includeOther) {
    const inExpr = namedOnly.map(b => `building_code.eq.${b}`).join(',');
    listingsQ = listingsQ.or(`${inExpr},building_code.is.null`);
  }
  const { data: listings } = await listingsQ;
  const allRaw = (listings as Array<{ id: string; nickname: string | null; building_code: string | null; master_listing_id: string | null }> | null) || [];
  const all = allRaw.map(l => ({ ...l, building_code: l.building_code || 'OTHER' }));

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

  // 4) Pricelabs metadata for bedrooms + price. MTL caveat: BH-73
  //    children have no own pricelabs row; resolve via master_listing_id.
  const masterIdsForFree = Array.from(new Set(
    all.filter(l => freeIds.includes(l.id))
      // master_listing_id is on the all rows from the listings query above
      .map(l => (l as { id: string; master_listing_id?: string | null }).master_listing_id)
      .filter((id): id is string => Boolean(id))
  ));
  const lookupIds = Array.from(new Set([...freeIds, ...masterIdsForFree]));
  const { data: pricelabs } = lookupIds.length > 0
    ? await sb
        .from('pricelabs_listings')
        .select('id, bedrooms')
        .in('id', lookupIds)
    : { data: [] };
  const bedroomsByListing = new Map<string, number>();
  for (const r of (pricelabs as Array<{ id: string; bedrooms: number | null }> | null) || []) {
    if (r.bedrooms != null) bedroomsByListing.set(r.id, r.bedrooms);
  }

  const { data: prices } = lookupIds.length > 0
    ? await sb
        .from('pricelabs_listing_snapshots')
        .select('listing_id, recommended_base_price, base, snapshot_date')
        .in('listing_id', lookupIds)
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
  // Lookup helpers with parent fallback
  const masterById = new Map<string, string | null>();
  for (const l of all as Array<{ id: string; master_listing_id?: string | null }>) {
    masterById.set(l.id, l.master_listing_id || null);
  }
  const priceFor = (id: string): number | null => {
    const own = priceByListing.get(id);
    if (own != null) return own;
    const m = masterById.get(id);
    if (m) return priceByListing.get(m) ?? null;
    return null;
  };
  const bedroomsFor = (id: string): number | null => {
    const own = bedroomsByListing.get(id);
    if (own != null) return own;
    const m = masterById.get(id);
    if (m) return bedroomsByListing.get(m) ?? null;
    return null;
  };

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
      bedrooms: bedroomsFor(l.id),
      base_price_usd: priceFor(l.id),
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
    const wanted = input.buildingCodes;
    const includeOther = wanted.includes('OTHER');
    const namedOnly = wanted.filter(b => b !== 'OTHER');
    if (namedOnly.length > 0 && !includeOther) {
      q = q.in('building_code', namedOnly);
    } else if (namedOnly.length > 0 && includeOther) {
      const inExpr = namedOnly.map(b => `building_code.eq.${b}`).join(',');
      q = q.or(`${inExpr},building_code.is.null`);
    } else if (includeOther) {
      q = q.is('building_code', null);
    }
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

  revalidatePath('/beithady/operations/calendar');
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
