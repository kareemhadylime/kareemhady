// Beithady · Generate Report · orchestrator.
// Takes a ReportConfig and returns a fully computed ReportData. Pulls from
// guesty_listings, guesty_reservations, guesty_reviews, and pricelabs_listing_snapshots.
// Single-pass: fetches per-period data once, then groups by the requested axes.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { bucketChannel, CHANNEL_LABEL } from './channel-taxonomy';
import { bucketBedrooms, BEDROOM_LABEL } from './bedroom-buckets';
import { daysBetween, monthsInRange } from './period-resolver';
import type {
  ReportConfig,
  ReportData,
  ReportRow,
  MetricCell,
  MetricKey,
  PeriodSpec,
  GroupAxis,
  BuildingCode,
  ChannelBucket,
  BedroomBucket,
} from './types';
import { fmtMetric, METRIC_UNIT, makeCell } from './types';

type ListingRow = {
  id: string;
  nickname: string | null;
  building_code: string | null;
  bedrooms: number | null;
  listing_type: string | null;
  active: boolean | null;
};

type ReservationRow = {
  id: string;
  listing_id: string | null;
  status: string | null;
  source: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  host_payout: number | null;
  guest_paid: number | null;
  currency: string | null;
  created_at_odoo: string | null;
};

type ReviewRow = {
  listing_id: string | null;
  overall_rating: number | null;
  channel_id: string | null;
  reviewer_role: string | null;
  created_at_guesty: string | null;
};

type PriceLabsSnapshot = {
  listing_id: string;
  occupancy_next_30: number | null;
  market_occupancy_next_30: number | null;
  adr_past_30: number | null;
};

const ACTIVE_BUILDING_CODES: readonly BuildingCode[] = [
  'BH-26',
  'BH-73',
  'BH-435',
  'BH-OK',
  'OTHER',
];

function buildingOf(l: ListingRow): BuildingCode {
  const c = l.building_code;
  if (c === 'BH-26' || c === 'BH-73' || c === 'BH-435' || c === 'BH-OK') return c;
  return 'OTHER';
}

function nightsOverlap(
  checkIn: string | null,
  checkOut: string | null,
  fromIso: string,
  toIso: string
): number {
  if (!checkIn || !checkOut) return 0;
  // Inclusive [from, to]: convert to [from, to+1) for half-open arithmetic.
  const a = Math.max(Date.parse(checkIn + 'T00:00:00Z'), Date.parse(fromIso + 'T00:00:00Z'));
  const tEnd = new Date(Date.parse(toIso + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const b = Math.min(
    Date.parse(checkOut + 'T00:00:00Z'),
    Date.parse(tEnd + 'T00:00:00Z')
  );
  if (b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function avg(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

type Bucket = {
  groupKey: string;
  groupLabels: { primary: string; secondary?: string };
  // Per period
  perPeriod: Record<
    string,
    {
      reservations: number;
      nights_booked: number;
      revenue_usd: number;
      lead_time_sum: number;
      lead_time_n: number;
      los_sum: number;
      los_n: number;
      review_overall_sum: number;
      review_n: number;
      channel_split: Record<ChannelBucket, number>;
      // Capacity
      unit_count: number;
      day_count: number;
    }
  >;
};

function emptyPerPeriod(unit_count: number, day_count: number) {
  return {
    reservations: 0,
    nights_booked: 0,
    revenue_usd: 0,
    lead_time_sum: 0,
    lead_time_n: 0,
    los_sum: 0,
    los_n: 0,
    review_overall_sum: 0,
    review_n: 0,
    channel_split: { airbnb: 0, booking_com: 0, other_ota: 0, manual: 0 } as Record<
      ChannelBucket,
      number
    >,
    unit_count,
    day_count,
  };
}

function groupKeyFor(
  listing: ListingRow,
  axis: GroupAxis,
  channelOverride?: ChannelBucket
): { key: string; primary: string; secondary?: string } {
  const b = buildingOf(listing);
  const br = bucketBedrooms(listing.bedrooms);
  switch (axis) {
    case 'building':
      return { key: b, primary: b };
    case 'bedroom':
      return { key: br, primary: BEDROOM_LABEL[br] };
    case 'listing':
      return {
        key: listing.id,
        primary: listing.nickname || listing.id.slice(0, 8),
      };
    case 'channel':
      return channelOverride
        ? { key: channelOverride, primary: CHANNEL_LABEL[channelOverride] }
        : { key: 'unknown', primary: 'Unknown' };
    case 'listing_type':
      return {
        key: listing.listing_type || 'SINGLE',
        primary: listing.listing_type || 'SINGLE',
      };
    case 'building_x_bedroom':
      return {
        key: `${b}|${br}`,
        primary: b,
        secondary: BEDROOM_LABEL[br],
      };
  }
}

export async function buildReport(config: ReportConfig): Promise<ReportData> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];

  // ---- Fetch listings (apply filters) -------------------------------------
  let listingsQ = sb
    .from('guesty_listings')
    .select('id, nickname, building_code, bedrooms, listing_type, active');

  const listingTypeFilter = config.filters.listingTypes;
  if (listingTypeFilter && listingTypeFilter.length) {
    listingsQ = listingsQ.in('listing_type', listingTypeFilter);
  }

  if (config.filters.listingIds && config.filters.listingIds.length) {
    listingsQ = listingsQ.in('id', config.filters.listingIds);
  }

  const { data: rawListings, error: lErr } = await listingsQ;
  if (lErr) throw new Error(`listings fetch failed: ${lErr.message}`);
  let listings = (rawListings || []) as ListingRow[];

  // Apply building / bedroom filters in-app (string mapping needed)
  if (config.filters.buildings && config.filters.buildings.length) {
    const allowed = new Set(config.filters.buildings);
    listings = listings.filter(l => allowed.has(buildingOf(l)));
  }
  if (config.filters.bedrooms && config.filters.bedrooms.length) {
    const allowed = new Set(config.filters.bedrooms);
    listings = listings.filter(l => allowed.has(bucketBedrooms(l.bedrooms)));
  }

  if (listings.length === 0) {
    warnings.push('No listings matched the filter set.');
  }

  const listingById = new Map(listings.map(l => [l.id, l] as const));
  const listingIds = listings.map(l => l.id);

  // Earliest from / latest to across all periods
  const fromMin = config.periods.reduce((m, p) => (m && m < p.from ? m : p.from), '');
  const toMax = config.periods.reduce((m, p) => (m && m > p.to ? m : p.to), '');

  // ---- Fetch reservations once across full window ------------------------
  let resQ = sb
    .from('guesty_reservations')
    .select(
      'id, listing_id, status, source, check_in_date, check_out_date, nights, host_payout, guest_paid, currency, created_at_odoo'
    )
    .lte('check_in_date', toMax)
    .gte('check_out_date', fromMin);

  if (listingIds.length) resQ = resQ.in('listing_id', listingIds);

  const { data: rawRes, error: rErr } = await resQ;
  if (rErr) throw new Error(`reservations fetch failed: ${rErr.message}`);
  let reservations = (rawRes || []) as ReservationRow[];

  // CANONICAL alignment (2026-05-03): Reports module now defaults to the
  // same status filter as briefs + Daily Performance Report.
  // status IN ('confirmed','checked_in','checked_out'). Setting
  // includeCancelled=true on a report config will widen to also include
  // cancelled (used by churn-analysis reports).
  if (!config.filters.includeCancelled) {
    reservations = reservations.filter(r => {
      const s = (r.status || '').toLowerCase();
      return s === 'confirmed' || s === 'checked_in' || s === 'checked_out';
    });
  } else {
    // Even when includeCancelled=true, drop inquiry/declined/expired —
    // these are non-events for revenue analysis.
    reservations = reservations.filter(r => {
      const s = (r.status || '').toLowerCase();
      return (
        s === 'confirmed' ||
        s === 'checked_in' ||
        s === 'checked_out' ||
        s === 'canceled'
      );
    });
  }

  if (config.filters.channels && config.filters.channels.length) {
    const allowed = new Set(config.filters.channels);
    reservations = reservations.filter(r => allowed.has(bucketChannel(r.source)));
  }

  // ---- Fetch reviews once -------------------------------------------------
  let revQ = sb
    .from('guesty_reviews')
    .select('listing_id, overall_rating, channel_id, reviewer_role, created_at_guesty')
    .eq('reviewer_role', 'guest')
    .gte('created_at_guesty', `${fromMin}T00:00:00Z`)
    .lte('created_at_guesty', `${toMax}T23:59:59Z`);

  if (listingIds.length) revQ = revQ.in('listing_id', listingIds);

  const { data: rawRev, error: revErr } = await revQ;
  if (revErr) throw new Error(`reviews fetch failed: ${revErr.message}`);
  let reviews = (rawRev || []) as ReviewRow[];

  if (config.filters.minRating != null) {
    const min = config.filters.minRating;
    reviews = reviews.filter(r => (r.overall_rating ?? 0) >= min);
  }

  // ---- PriceLabs market overlay (latest snapshot only — used for vs-market) -
  let marketByListing = new Map<string, PriceLabsSnapshot>();
  if (
    config.metrics.includes('market_occupancy_pct') ||
    config.metrics.includes('occ_vs_market_pp')
  ) {
    const { data: latest } = await sb
      .from('pricelabs_listing_snapshots')
      .select('listing_id, occupancy_next_30, market_occupancy_next_30, adr_past_30, snapshot_date')
      .in('listing_id', listingIds.length ? listingIds : ['none'])
      .order('snapshot_date', { ascending: false })
      .limit(2000);
    const seen = new Set<string>();
    for (const row of (latest || []) as Array<PriceLabsSnapshot & { snapshot_date: string }>) {
      if (seen.has(row.listing_id)) continue;
      seen.add(row.listing_id);
      marketByListing.set(row.listing_id, {
        listing_id: row.listing_id,
        occupancy_next_30: row.occupancy_next_30,
        market_occupancy_next_30: row.market_occupancy_next_30,
        adr_past_30: row.adr_past_30,
      });
    }
  }

  // ---- Build buckets ------------------------------------------------------
  const axis = config.groupBy.primary;
  const buckets = new Map<string, Bucket>();

  function ensureBucket(
    keyInfo: { key: string; primary: string; secondary?: string },
    listingsInGroup: ListingRow[]
  ): Bucket {
    let b = buckets.get(keyInfo.key);
    if (!b) {
      b = {
        groupKey: keyInfo.key,
        groupLabels: { primary: keyInfo.primary, secondary: keyInfo.secondary },
        perPeriod: {},
      };
      // Pre-init perPeriod with capacity numbers
      for (const p of config.periods) {
        const days = daysBetween(p.from, p.to);
        b.perPeriod[p.id] = emptyPerPeriod(listingsInGroup.length, days);
      }
      buckets.set(keyInfo.key, b);
    }
    return b;
  }

  // Group listings by the chosen axis (channel groups its own way)
  if (axis === 'channel') {
    // For channel grouping, every listing contributes to all channel buckets; capacity is total
    for (const ch of ['airbnb', 'booking_com', 'other_ota', 'manual'] as ChannelBucket[]) {
      ensureBucket(
        { key: ch, primary: CHANNEL_LABEL[ch] },
        listings // all listings sit "behind" each channel
      );
    }
  } else {
    const grouped = new Map<string, ListingRow[]>();
    for (const l of listings) {
      const k = groupKeyFor(l, axis);
      const arr = grouped.get(k.key) || [];
      arr.push(l);
      grouped.set(k.key, arr);
    }
    for (const [, arr] of grouped) {
      const k = groupKeyFor(arr[0], axis);
      ensureBucket(k, arr);
    }
  }

  // ---- Fold reservations into period buckets ------------------------------
  for (const r of reservations) {
    if (!r.listing_id) continue;
    const listing = listingById.get(r.listing_id);
    if (!listing) continue;
    const channel = bucketChannel(r.source);

    for (const period of config.periods) {
      const nightsInPeriod = nightsOverlap(
        r.check_in_date,
        r.check_out_date,
        period.from,
        period.to
      );
      if (nightsInPeriod === 0) continue;

      // Pro-rate revenue by overlap fraction of total stay
      const totalNights = r.nights || nightsInPeriod;
      const fraction = totalNights > 0 ? nightsInPeriod / totalNights : 1;
      const rev = (r.host_payout || 0) * fraction;

      const targetKey =
        axis === 'channel'
          ? channel
          : groupKeyFor(listing, axis).key;
      const b = buckets.get(targetKey);
      if (!b) continue;

      const slot = b.perPeriod[period.id];
      slot.nights_booked += nightsInPeriod;
      slot.revenue_usd += rev;
      slot.channel_split[channel] += nightsInPeriod;

      // Reservations counted only when check_in falls in period (avoid double-count)
      if (r.check_in_date && r.check_in_date >= period.from && r.check_in_date <= period.to) {
        slot.reservations += 1;
        if (r.nights != null) {
          slot.los_sum += r.nights;
          slot.los_n += 1;
        }
        if (r.created_at_odoo) {
          const lead = (Date.parse(r.check_in_date) - Date.parse(r.created_at_odoo)) / 86400000;
          if (Number.isFinite(lead) && lead >= 0) {
            slot.lead_time_sum += lead;
            slot.lead_time_n += 1;
          }
        }
      }
    }
  }

  // ---- Fold reviews -------------------------------------------------------
  for (const rv of reviews) {
    if (!rv.listing_id || !rv.created_at_guesty) continue;
    const listing = listingById.get(rv.listing_id);
    if (!listing) continue;
    const dateIso = rv.created_at_guesty.slice(0, 10);
    for (const period of config.periods) {
      if (dateIso < period.from || dateIso > period.to) continue;
      const targetKeys: string[] = [];
      if (axis === 'channel') {
        // attach review to its channel
        const ch = (rv.channel_id || '').toLowerCase().includes('airbnb')
          ? 'airbnb'
          : (rv.channel_id || '').toLowerCase().includes('booking')
            ? 'booking_com'
            : 'manual';
        targetKeys.push(ch);
      } else {
        targetKeys.push(groupKeyFor(listing, axis).key);
      }
      for (const key of targetKeys) {
        const b = buckets.get(key);
        if (!b) continue;
        const slot = b.perPeriod[period.id];
        if (rv.overall_rating != null) {
          slot.review_overall_sum += rv.overall_rating;
          slot.review_n += 1;
        }
      }
    }
  }

  // ---- Compute metrics into rows -----------------------------------------
  const rows: ReportRow[] = [];
  const totalsAcc: Record<string, { num: number; den: number; sum: number; n: number }> = {};

  function bumpTotal(periodId: string, key: MetricKey, val: number | null) {
    if (val == null || !Number.isFinite(val)) return;
    const k = `${periodId}::${key}`;
    if (!totalsAcc[k]) totalsAcc[k] = { num: 0, den: 0, sum: 0, n: 0 };
    totalsAcc[k].sum += val;
    totalsAcc[k].n += 1;
  }

  // Pre-compute total revenue per period for share% denom
  const revTotalPerPeriod: Record<string, number> = {};
  for (const [, b] of buckets) {
    for (const p of config.periods) {
      revTotalPerPeriod[p.id] = (revTotalPerPeriod[p.id] || 0) + b.perPeriod[p.id].revenue_usd;
    }
  }

  for (const [, b] of buckets) {
    const cells: Record<string, MetricCell> = {};
    const channelSplit: Record<string, Record<ChannelBucket, number>> = {};
    let bucketReservations = 0;
    let bucketNights = 0;
    let bucketReviews = 0;

    for (const p of config.periods) {
      const slot = b.perPeriod[p.id];
      bucketReservations += slot.reservations;
      bucketNights += slot.nights_booked;
      bucketReviews += slot.review_n;
      channelSplit[p.id] = slot.channel_split;

      const cap = slot.unit_count * slot.day_count;
      const occ = safeDiv(slot.nights_booked, cap);
      const adr = safeDiv(slot.revenue_usd, slot.nights_booked);
      const months = monthsInRange(p.from, p.to);
      const avgRevMonth = safeDiv(slot.revenue_usd, months);
      const revpar = safeDiv(slot.revenue_usd, cap);
      const losAvg = safeDiv(slot.los_sum, slot.los_n);
      const leadAvg = safeDiv(slot.lead_time_sum, slot.lead_time_n);
      const ratingAvg = safeDiv(slot.review_overall_sum, slot.review_n);
      const revShare = safeDiv(slot.revenue_usd, revTotalPerPeriod[p.id] || 0);

      // Market overlay (uses latest PL snapshot per listing — coarse)
      let marketOcc: number | null = null;
      if (
        config.metrics.includes('market_occupancy_pct') ||
        config.metrics.includes('occ_vs_market_pp')
      ) {
        // For non-channel axes, average market occ across the listings in this group
        if (axis !== 'channel') {
          const ms: number[] = [];
          for (const l of listings) {
            const k = groupKeyFor(l, axis).key;
            if (k !== b.groupKey) continue;
            const m = marketByListing.get(l.id);
            if (m?.market_occupancy_next_30 != null) ms.push(m.market_occupancy_next_30);
          }
          marketOcc = avg(ms);
        }
      }

      const occPct = occ != null ? occ * 100 : null;
      const marketOccPct = marketOcc != null ? marketOcc * 100 : null;

      const setCell = (key: MetricKey, value: number | null) => {
        const c = makeCell(value, key);
        cells[`${p.id}::${key}`] = c;
        bumpTotal(p.id, key, value);
      };

      for (const m of config.metrics) {
        switch (m) {
          case 'occupancy_pct':
            setCell(m, occPct);
            break;
          case 'market_occupancy_pct':
            setCell(m, marketOccPct);
            break;
          case 'occ_vs_market_pp':
            setCell(
              m,
              occPct != null && marketOccPct != null ? occPct - marketOccPct : null
            );
            break;
          case 'total_revenue_usd':
            setCell(m, slot.revenue_usd);
            break;
          case 'avg_revenue_per_month_usd':
            setCell(m, avgRevMonth);
            break;
          case 'revpar_usd':
            setCell(m, revpar);
            break;
          case 'revenue_share_pct':
            setCell(m, revShare != null ? revShare * 100 : null);
            break;
          case 'adr_usd':
            setCell(m, adr);
            break;
          case 'reservations_count':
            setCell(m, slot.reservations);
            break;
          case 'avg_lead_time_days':
            setCell(m, leadAvg);
            break;
          case 'avg_los_nights':
            setCell(m, losAvg);
            break;
          case 'avg_overall_rating':
            setCell(m, ratingAvg);
            break;
          case 'total_reviews':
            setCell(m, slot.review_n);
            break;
        }
      }

      // Apply target-flagging
      if (config.comparison?.mode === 'target' && config.comparison.targets) {
        for (const m of config.metrics) {
          const t = config.comparison.targets[m];
          const cell = cells[`${p.id}::${m}`];
          if (t != null && cell?.value != null) {
            cell.flagged = cell.value >= t ? 'above_target' : 'below_target';
          }
        }
      }
    }

    rows.push({
      groupKey: b.groupKey,
      groupLabels: b.groupLabels,
      cells,
      channelSplit,
      samples: {
        reservations: bucketReservations,
        nights: bucketNights,
        reviews: bucketReviews,
      },
    });
  }

  // ---- Totals row --------------------------------------------------------
  const totals: Record<string, MetricCell> = {};
  for (const p of config.periods) {
    for (const m of config.metrics) {
      const k = `${p.id}::${m}`;
      const acc = totalsAcc[k];
      if (!acc) continue;
      // For sum-style metrics use sum; for ratio-style use mean of the rows.
      const isSumLike =
        m === 'total_revenue_usd' ||
        m === 'reservations_count' ||
        m === 'total_reviews';
      const value = isSumLike ? acc.sum : acc.sum / Math.max(1, acc.n);
      totals[k] = makeCell(value, m);
    }
  }

  // ---- Comparisons (period vs baseline, group vs baseline) --------------
  const deltas: ReportData['comparisons']['deltas'] = {};
  if (config.comparison?.mode === 'period' && config.comparison.baseline) {
    const base = config.comparison.baseline;
    for (const r of rows) {
      for (const p of config.periods) {
        if (p.id === base) continue;
        for (const m of config.metrics) {
          const baseV = r.cells[`${base}::${m}`]?.value;
          const curV = r.cells[`${p.id}::${m}`]?.value;
          if (baseV != null && curV != null) {
            const abs = curV - baseV;
            const pct = baseV !== 0 ? (abs / Math.abs(baseV)) * 100 : null;
            deltas[`${r.groupKey}::${p.id}::${m}`] = { abs, pct };
          }
        }
      }
    }
  } else if (config.comparison?.mode === 'group' && config.comparison.baseline) {
    const baseRow = rows.find(r => r.groupKey === config.comparison?.baseline);
    if (baseRow) {
      for (const r of rows) {
        if (r.groupKey === baseRow.groupKey) continue;
        for (const p of config.periods) {
          for (const m of config.metrics) {
            const baseV = baseRow.cells[`${p.id}::${m}`]?.value;
            const curV = r.cells[`${p.id}::${m}`]?.value;
            if (baseV != null && curV != null) {
              const abs = curV - baseV;
              const pct = baseV !== 0 ? (abs / Math.abs(baseV)) * 100 : null;
              deltas[`${r.groupKey}::${p.id}::${m}`] = { abs, pct };
            }
          }
        }
      }
    }
  }

  // ---- Anomaly detection (>2σ) ------------------------------------------
  const anomalies: ReportData['anomalies'] = [];
  if (config.enableAnomalyDetection !== false) {
    for (const p of config.periods) {
      for (const m of config.metrics) {
        if (m === 'total_reviews' || m === 'reservations_count') continue; // count metrics noisy
        const vals = rows
          .map(r => r.cells[`${p.id}::${m}`]?.value)
          .filter((v): v is number => v != null && Number.isFinite(v));
        if (vals.length < 4) continue;
        const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
        const variance =
          vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length;
        const sd = Math.sqrt(variance);
        if (sd === 0) continue;
        for (const r of rows) {
          const v = r.cells[`${p.id}::${m}`]?.value;
          if (v == null) continue;
          const z = (v - mean) / sd;
          if (z > 2) {
            r.cells[`${p.id}::${m}`].flagged = 'anomaly_high';
            anomalies.push({
              groupKey: r.groupKey,
              metricKey: m,
              periodId: p.id,
              reason: `z=${z.toFixed(1)} (mean ${fmtMetric(mean, METRIC_UNIT[m])})`,
            });
          } else if (z < -2) {
            r.cells[`${p.id}::${m}`].flagged = 'anomaly_low';
            anomalies.push({
              groupKey: r.groupKey,
              metricKey: m,
              periodId: p.id,
              reason: `z=${z.toFixed(1)} (mean ${fmtMetric(mean, METRIC_UNIT[m])})`,
            });
          }
        }
      }
    }
  }

  // Sort rows by primary label for stable rendering
  rows.sort((a, b) => a.groupLabels.primary.localeCompare(b.groupLabels.primary));

  return {
    config,
    runAt: new Date().toISOString(),
    rows,
    totals,
    comparisons: { deltas },
    anomalies,
    warnings: warnings.length ? warnings : undefined,
  };
}
