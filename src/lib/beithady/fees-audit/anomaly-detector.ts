// Beithady · Fee Audit · 5 anomaly detectors. Fixed thresholds per Q8.

import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';
import type {
  Anomaly,
  ListingMeta,
  DailyCell,
} from './types';
import { ANOMALY_THRESHOLDS, ANOMALY_LABEL } from './types';

export function detectAnomalies(
  listings: ListingMeta[],
  daily: DailyCell[],
  _channels: ChannelBucket[]
): Anomaly[] {
  const out: Anomaly[] = [];

  // A: zero/missing — cleaning fee == 0 or null, missing forward calendar.
  // Per Q (2026-05-07): Guesty prices are all-inclusive (taxes baked in), so
  // a missing per-listing tax config is no longer an anomaly — there's
  // nothing to add on top in the first place.
  for (const l of listings) {
    if (l.cleaning_fee == null || l.cleaning_fee === 0) {
      out.push({
        severity: 'critical',
        kind: 'zero_cleaning_fee',
        listing_id: l.id,
        listing_nickname: l.nickname,
        message: `${l.nickname} has zero / missing cleaning fee`,
        details: { current: l.cleaning_fee },
      });
    }
    for (const reason of l.missing_data_reasons) {
      if (reason.includes('forward')) {
        out.push({
          severity: 'critical',
          kind: 'missing_forward_calendar',
          listing_id: l.id,
          listing_nickname: l.nickname,
          message: `${l.nickname}: ${reason}`,
          details: { reason },
        });
      }
    }
  }

  // B: peer outlier — cleaning fee > 50% off median for same (building, bedrooms)
  const peerGroups = new Map<string, ListingMeta[]>();
  for (const l of listings) {
    const k = `${l.building}|${l.bedrooms}`;
    const arr = peerGroups.get(k) || [];
    arr.push(l);
    peerGroups.set(k, arr);
  }
  for (const [, group] of peerGroups) {
    if (group.length < 3) continue; // need a peer set
    const cleanings = group
      .map(l => l.cleaning_fee)
      .filter((v): v is number => v != null && v > 0)
      .sort((a, b) => a - b);
    if (cleanings.length < 3) continue;
    const median = cleanings[Math.floor(cleanings.length / 2)];
    if (median <= 0) continue;
    const tol = (median * ANOMALY_THRESHOLDS.cleaning_outlier_pct) / 100;
    for (const l of group) {
      if (l.cleaning_fee == null) continue;
      if (Math.abs(l.cleaning_fee - median) > tol) {
        out.push({
          severity: 'warning',
          kind: 'cleaning_fee_outlier',
          listing_id: l.id,
          listing_nickname: l.nickname,
          message: `${l.nickname} cleaning fee $${l.cleaning_fee} is >50% off peer median $${median.toFixed(0)}`,
          details: { value: l.cleaning_fee, peer_median: median, peer_count: group.length },
        });
      }
    }
  }

  // C: channel rate parity — same listing × date, max/min gap > thresholds
  const dailyByListingDate = new Map<string, DailyCell>();
  for (const d of daily) {
    dailyByListingDate.set(`${d.listing_id}|${d.date}`, d);
  }
  for (const d of daily) {
    const validRates = d.per_channel
      .map(c => c.guest_gross_usd)
      .filter((v): v is number => v != null && v > 0);
    if (validRates.length < 2) continue;
    const max = Math.max(...validRates);
    const min = Math.min(...validRates);
    if (min <= 0) continue;
    const gapPct = ((max - min) / min) * 100;
    const lst = listings.find(l => l.id === d.listing_id);
    if (!lst) continue;
    if (gapPct >= ANOMALY_THRESHOLDS.channel_rate_gap_critical_pct) {
      out.push({
        severity: 'critical',
        kind: 'channel_rate_gap_critical',
        listing_id: d.listing_id,
        listing_nickname: lst.nickname,
        date: d.date,
        message: `${lst.nickname} ${d.date}: channel rate gap ${gapPct.toFixed(0)}% (min $${min.toFixed(0)}, max $${max.toFixed(0)})`,
        details: { gap_pct: gapPct, min, max, per_channel: d.per_channel },
      });
    } else if (gapPct >= ANOMALY_THRESHOLDS.channel_rate_gap_warn_pct) {
      out.push({
        severity: 'warning',
        kind: 'channel_rate_gap_warning',
        listing_id: d.listing_id,
        listing_nickname: lst.nickname,
        date: d.date,
        message: `${lst.nickname} ${d.date}: channel rate gap ${gapPct.toFixed(0)}% (min $${min.toFixed(0)}, max $${max.toFixed(0)})`,
        details: { gap_pct: gapPct, min, max },
      });
    }
  }

  // D: min-stay parity — listing has different min_nights across channels
  for (const l of listings) {
    const values = Object.values(l.min_nights_per_channel).filter(
      (v): v is number => v != null
    );
    const distinct = new Set(values);
    if (distinct.size > 1) {
      out.push({
        severity: 'critical',
        kind: 'min_stay_parity_violation',
        listing_id: l.id,
        listing_nickname: l.nickname,
        message: `${l.nickname} min-stay differs across channels: ${JSON.stringify(l.min_nights_per_channel)}`,
        details: { per_channel: l.min_nights_per_channel },
      });
    }
  }

  // E: discount opportunity — informational
  // (skipped without occupancy_next_30 join; the existing ChannelMixReport
  //  surfaces this. We could add later by joining pricelabs_listing_snapshots.)

  return out.sort((a, b) => {
    const sev = (s: Anomaly['severity']) =>
      s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
    return sev(a.severity) - sev(b.severity);
  });
}

export { ANOMALY_LABEL };
