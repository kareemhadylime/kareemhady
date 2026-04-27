import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { recordAudit } from '@/lib/beithady/audit';
import { getUpcomingArrivals, matchBeithadyGuest } from './reservation-helpers';

export type UpsellSku = {
  sku: string;
  name: string;
  description: string | null;
  price_usd: number;
  ai_targeting_hint: string | null;
  payment_link_url: string | null;
};

// Selects up to 3 upsell SKUs for a reservation. Heuristic for Phase F:
// 1. Always offer early_checkin + late_checkout if enabled and not
//    already sold to this guest
// 2. Add 1 contextual offer based on group size + nights:
//    - nights >= 5 → cleaning_extra
//    - guests >= 3 → grocery_stocking
//    - else → photographer
// Phase E's classifier could later replace this with smarter targeting.
export async function selectSkusForReservation(
  reservation: { id: string; nights: number | null; building_code: string | null }
): Promise<UpsellSku[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_upsell_catalog')
    .select('sku, name, description, price_usd, ai_targeting_hint, payment_link_url, building_code')
    .eq('enabled', true)
    .order('display_order', { ascending: true });
  const all = (data as Array<UpsellSku & { building_code: string | null }> | null) || [];
  // Filter to building-specific OR universal entries
  const eligible = all.filter(s => s.building_code === null || s.building_code === reservation.building_code);
  const skus = new Map(eligible.map(s => [s.sku, s]));

  const picks: UpsellSku[] = [];
  if (skus.has('early_checkin')) picks.push(skus.get('early_checkin')!);
  if (skus.has('late_checkout')) picks.push(skus.get('late_checkout')!);
  // Contextual third pick
  const nights = reservation.nights || 0;
  if (nights >= 5 && skus.has('cleaning_extra')) picks.push(skus.get('cleaning_extra')!);
  else if (skus.has('grocery_stocking')) picks.push(skus.get('grocery_stocking')!);
  else if (skus.has('photographer')) picks.push(skus.get('photographer')!);

  // De-dupe + cap at 3
  const seen = new Set<string>();
  return picks.filter(p => {
    if (seen.has(p.sku)) return false;
    seen.add(p.sku);
    return true;
  }).slice(0, 3);
}

export function renderUpsellMessage(
  guestFirstName: string,
  listing: string,
  skus: UpsellSku[]
): string {
  if (skus.length === 0) return '';
  const lines = skus.map(s => `• ${s.name} — $${s.price_usd.toFixed(0)}\n  ${s.description ?? ''}`);
  return `Hi ${guestFirstName},\n\nYour stay at ${listing} is coming up. A few extras you can add to make it nicer (just reply with the ones you want):\n\n${lines.join('\n\n')}\n\nReply *yes* to all, or pick the ones you want by name. Anything else, just ask.\n\nBeit Hady team`;
}

export async function runUpsellDispatch(): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  errors: Array<{ reservation_id: string; error: string }>;
}> {
  const sb = supabaseAdmin();
  // Window: check-in is 36-60h from now (so 12:00 Cairo cron sends to
  // ~next-next-day arrivals)
  const arrivals = await getUpcomingArrivals(36, 60);
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ reservation_id: string; error: string }> = [];

  for (const r of arrivals) {
    if (!r.id) { skipped++; continue; }
    const guest = await matchBeithadyGuest(r.guest_email, r.guest_phone);
    if (!guest || !guest.phone_e164) { skipped++; continue; }
    // Idempotency
    const { data: existing } = await sb
      .from('beithady_upsell_offers')
      .select('id')
      .eq('reservation_id', r.id)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const skus = await selectSkusForReservation({
      id: r.id,
      nights: r.nights,
      building_code: r.building_code,
    });
    if (skus.length === 0) { skipped++; continue; }

    const firstName = (guest.full_name || r.guest_name || 'there').split(' ')[0];
    const body = renderUpsellMessage(firstName, r.listing_nickname || 'your apartment', skus);

    // Ensure wa_casual conversation
    const { data: convId, error: convErr } = await sb.rpc('beithady_ensure_wa_casual_conversation', {
      p_phone_digits: guest.phone_e164.replace(/[^0-9]/g, ''),
      p_guest_name: guest.full_name || r.guest_name,
    });
    if (convErr || !convId) {
      errors.push({ reservation_id: r.id, error: convErr?.message || 'no_conversation' });
      continue;
    }

    const result = await sendWaCasualMessage({
      beithadyConversationId: convId as string,
      body,
      agentUserId: null,
      agentDisplayName: 'Beit Hady automated',
    });

    const totalUsd = skus.reduce((s, p) => s + Number(p.price_usd || 0), 0);
    if (result.ok) {
      await sb.from('beithady_upsell_offers').insert({
        reservation_id: r.id,
        guest_id: guest.id,
        building_code: r.building_code,
        offered_skus: skus.map(s => s.sku),
        message_id: result.messageId,
        status: 'sent',
        total_usd: totalUsd,
      });
      sent++;
    } else {
      errors.push({ reservation_id: r.id, error: result.error });
    }
  }

  await recordAudit({
    module: 'communication',
    action: 'upsell_dispatch_run',
    metadata: { considered: arrivals.length, sent, skipped, error_count: errors.length },
  });

  return { considered: arrivals.length, sent, skipped, errors };
}
