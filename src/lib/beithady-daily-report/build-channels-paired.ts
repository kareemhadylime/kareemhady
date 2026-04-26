import 'server-only';
import type { ReportPeriodWindow } from './cairo-dates';
import {
  nightsInRange,
  normalizeChannel,
  type ReservationRow,
} from './reservations';

// Booking-channel mix paired Yesterday + MTD (replaces the v1
// MTD-only mix). Per channel: revenue and pct for both windows.
// Net column (S4 channel commission) is left null until we wire a
// commission-rate config; the field placeholder lets the renderer
// reserve column space.

export type PairedChannelMix = {
  channel: string;
  yesterday_revenue_usd: number;
  yesterday_pct: number;
  mtd_revenue_usd: number;
  mtd_pct: number;
  yesterday_net_usd: number | null;
  mtd_net_usd: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildPairedChannelMix(
  active: ReservationRow[],
  ctx: ReportPeriodWindow
): PairedChannelMix[] {
  const yMap = new Map<string, number>();
  const mMap = new Map<string, number>();

  for (const r of active) {
    if (!r.host_payout_usd || !r.nights || !r.check_in_date) continue;
    const ch = normalizeChannel(r.source);

    // Yesterday: revenue allocated to nights that fall on yesterday
    // specifically. (Long stays straddling yesterday count their per-
    // night share for that day.)
    const yNights = nightsInRange(r, ctx.yesterday, ctx.yesterday);
    if (yNights > 0) {
      const yRev = (r.host_payout_usd * yNights) / r.nights;
      yMap.set(ch, (yMap.get(ch) || 0) + yRev);
    }

    // MTD: revenue allocated to nights between mtd_start and yesterday
    // (inclusive). Same per-night allocation.
    const mNights = nightsInRange(r, ctx.mtd_start, ctx.mtd_end);
    if (mNights > 0) {
      const mRev = (r.host_payout_usd * mNights) / r.nights;
      mMap.set(ch, (mMap.get(ch) || 0) + mRev);
    }
  }

  const ySum = [...yMap.values()].reduce((a, b) => a + b, 0);
  const mSum = [...mMap.values()].reduce((a, b) => a + b, 0);

  const channels = new Set<string>([...yMap.keys(), ...mMap.keys()]);
  const out: PairedChannelMix[] = [];
  for (const channel of channels) {
    const yRev = yMap.get(channel) || 0;
    const mRev = mMap.get(channel) || 0;
    out.push({
      channel,
      yesterday_revenue_usd: round2(yRev),
      yesterday_pct: ySum > 0 ? Math.round((yRev / ySum) * 1000) / 10 : 0,
      mtd_revenue_usd: round2(mRev),
      mtd_pct: mSum > 0 ? Math.round((mRev / mSum) * 1000) / 10 : 0,
      yesterday_net_usd: null,
      mtd_net_usd: null,
    });
  }
  out.sort((a, b) => b.mtd_revenue_usd - a.mtd_revenue_usd);
  return out;
}
