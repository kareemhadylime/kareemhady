import 'server-only';
import type { ReportPeriodWindow } from './cairo-dates';
import type { ReservationRow } from './reservations';

// "Check-ins with recorded payment" (yesterday + MTD) plus the
// confirmed-but-unpaid flagged list (S5).
//
// Definition: a check-in counts as "with payment" when its host_payout_usd
// is positive (Guesty has settled the payout for this stay) OR when it
// has a non-null guest_paid_usd (guest paid through Guesty/channel and
// Guesty mirrors the receipt).
//
// Stripe-side payments aren't easily linked to specific check-ins from
// our current schema, so we accept some false negatives for direct stays
// paid via Stripe. The "without payment" list surfaces these for review.

export type CheckinPaymentSection = {
  yesterday: { checkins: number; with_payment: number; without_payment: number; pct: number };
  mtd: { checkins: number; with_payment: number; without_payment: number; pct: number };
  flagged: Array<{
    code: string | null;
    unit: string;
    guest: string | null;
    check_in_date: string;
    reason: string;
  }>;
};

const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out']);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildCheckinPaymentSection(
  active: ReservationRow[],
  ctx: ReportPeriodWindow
): CheckinPaymentSection {
  const yesterday = ctx.yesterday;
  const mtdStart = ctx.mtd_start;

  let y_total = 0,
    y_paid = 0,
    m_total = 0,
    m_paid = 0;
  const flagged: CheckinPaymentSection['flagged'] = [];

  for (const r of active) {
    if (!r.status || !ACTIVE_STATUSES.has(r.status)) continue;
    if (!r.check_in_date) continue;
    const ci = r.check_in_date;
    const hasPayment =
      (r.host_payout_usd != null && r.host_payout_usd > 0) ||
      (r.guest_paid_usd != null && r.guest_paid_usd > 0);

    if (ci === yesterday) {
      y_total += 1;
      if (hasPayment) y_paid += 1;
      else
        flagged.push({
          code: r.confirmation_code,
          unit: r.listing_nickname || r.listing_id || 'Unknown',
          guest: r.guest_name,
          check_in_date: ci,
          reason: 'no_payment_recorded',
        });
    }
    if (ci >= mtdStart && ci <= yesterday) {
      m_total += 1;
      if (hasPayment) m_paid += 1;
    }
  }

  return {
    yesterday: {
      checkins: y_total,
      with_payment: y_paid,
      without_payment: y_total - y_paid,
      pct: y_total > 0 ? round1((y_paid / y_total) * 100) : 0,
    },
    mtd: {
      checkins: m_total,
      with_payment: m_paid,
      without_payment: m_total - m_paid,
      pct: m_total > 0 ? round1((m_paid / m_total) * 100) : 0,
    },
    flagged: flagged.slice(0, 25),
  };
}
