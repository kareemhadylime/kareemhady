import 'server-only';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

// Phase J.7 — payment resolver for non-OTA reservations.
//
// For Airbnb / Booking.com / Vrbo / Expedia / Hopper, the channel
// collects payment upfront and the recompute_payment RPC marks the
// reservation 'paid' on confirmation. For Direct / Website / manual
// reservations, payment lives in Stripe and our DB needs to query
// Stripe by `metadata.guesty_reservation_id` (preferred) or fall back
// to amount + timestamp window matching.
//
// On match, we update beithady_reservation_overrides.payment_paid_cents
// and recompute payment_status (paid/partial/unpaid).

const OTA_CHANNELS = /(airbnb|booking|vrbo|expedia|hopper)/i;

export type PaymentResolution = {
  ok: boolean;
  source: 'channel' | 'stripe' | 'manual' | 'guesty' | 'none';
  paid_cents: number;
  total_cents: number;
  balance_cents: number;
  status: 'paid' | 'partial' | 'unpaid' | 'n_a';
  currency: string;
  stripe_payment_intent_id?: string;
  message?: string;
};

export async function resolvePaymentForReservation(reservationId: string): Promise<PaymentResolution> {
  const sb = supabaseAdmin();
  const { data: r } = await sb
    .from('guesty_reservations')
    .select('id, status, integration_platform, source, host_payout, raw, currency, check_in_date')
    .eq('id', reservationId)
    .maybeSingle();
  if (!r) {
    return { ok: false, source: 'none', paid_cents: 0, total_cents: 0, balance_cents: 0, status: 'n_a', currency: 'USD', message: 'reservation not found' };
  }
  type Row = {
    id: string;
    status: string | null;
    integration_platform: string | null;
    source: string | null;
    host_payout: number | string | null;
    raw: { money?: { hostPayout?: number; commission?: number; currency?: string; totalAmount?: number } } | null;
    currency: string | null;
    check_in_date: string | null;
  };
  const row = r as Row;

  const channel = row.integration_platform || row.source || '';
  const money = row.raw?.money || {};
  const totalNum = (money.totalAmount ?? null)
    ?? ((Number(money.hostPayout || 0) + Number(money.commission || 0)) || Number(row.host_payout || 0));
  const total = totalNum != null ? Math.round(totalNum * 100) : 0;
  const currency = (money.currency || row.currency || 'USD').toUpperCase();

  // Cancelled → n/a
  if (row.status === 'canceled') {
    return { ok: true, source: 'channel', paid_cents: 0, total_cents: total, balance_cents: 0, status: 'n_a', currency };
  }

  // Inquiry → unpaid placeholder
  if (row.status === 'inquiry') {
    return { ok: true, source: 'guesty', paid_cents: 0, total_cents: total, balance_cents: total, status: 'unpaid', currency };
  }

  // OTA confirmed → channel handles payment, treat as paid
  if (row.status === 'confirmed' && OTA_CHANNELS.test(channel)) {
    return { ok: true, source: 'channel', paid_cents: total, total_cents: total, balance_cents: 0, status: 'paid', currency };
  }

  // Direct/Website/manual → query Stripe
  return resolveFromStripe(row.id, total, currency, row.check_in_date);
}

async function resolveFromStripe(
  reservationId: string,
  total: number,
  currency: string,
  checkInDate: string | null,
): Promise<PaymentResolution> {
  if (!process.env.STRIPE_SECRET_KEY) {
    // Stripe not configured — fall back to unpaid placeholder
    return { ok: true, source: 'guesty', paid_cents: 0, total_cents: total, balance_cents: total, status: 'unpaid', currency };
  }

  try {
    const s = stripe();
    // 1) Preferred: search PaymentIntents by metadata.guesty_reservation_id
    const search = await s.paymentIntents.search({
      query: `metadata['guesty_reservation_id']:'${reservationId}' AND status:'succeeded'`,
      limit: 10,
    });
    let paid = 0;
    let lastPiId: string | undefined;
    for (const pi of search.data) {
      paid += pi.amount_received || 0;
      lastPiId = pi.id;
    }

    // 2) Fallback: if no metadata match and we know the amount + a check-in
    //    window, search for payments around that time. Heuristic only — return
    //    "unpaid" if we're not confident.
    if (paid === 0 && total > 0 && checkInDate) {
      const windowStart = Math.floor(new Date(checkInDate).getTime() / 1000) - 30 * 86400;
      const windowEnd = Math.floor(new Date(checkInDate).getTime() / 1000) + 7 * 86400;
      const fallback = await s.paymentIntents.search({
        query: `amount:${total} AND currency:'${currency.toLowerCase()}' AND status:'succeeded' AND created>=${windowStart} AND created<=${windowEnd}`,
        limit: 5,
      });
      if (fallback.data.length === 1) {
        paid = fallback.data[0].amount_received || 0;
        lastPiId = fallback.data[0].id;
      }
    }

    const balance = Math.max(0, total - paid);
    const status: PaymentResolution['status'] = paid >= total && total > 0
      ? 'paid'
      : paid > 0
        ? 'partial'
        : 'unpaid';
    return {
      ok: true,
      source: 'stripe',
      paid_cents: paid,
      total_cents: total,
      balance_cents: balance,
      status,
      currency,
      stripe_payment_intent_id: lastPiId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      source: 'guesty',
      paid_cents: 0,
      total_cents: total,
      balance_cents: total,
      status: 'unpaid',
      currency,
      message: `stripe lookup failed: ${msg}`,
    };
  }
}
