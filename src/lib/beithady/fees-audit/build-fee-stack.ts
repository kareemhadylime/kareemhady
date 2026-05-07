// Beithady · Fee Audit · orchestrator.
// Pulls listings × forward-window dates × channels and computes the full
// FeeBreakdown grid + runs anomaly detectors.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  bucketBuilding,
  type BuildingBucket,
  type ChannelBucket,
} from '@/lib/beithady/guesty-metrics';
import type {
  FeeAuditConfig,
  FeeAuditData,
  ListingMeta,
  DailyCell,
} from './types';
import { quoteStay, mapChannelKey } from './quote-calculator';
import { detectAnomalies } from './anomaly-detector';

const DEFAULT_CHANNELS: ChannelBucket[] = [
  'airbnb',
  'booking_com',
  'other_ota',
  'manual',
];

export async function buildFeeStack(
  config: FeeAuditConfig
): Promise<FeeAuditData> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];

  const channels = config.channels.length ? config.channels : DEFAULT_CHANNELS;
  const startDate = config.startDate;
  const endDate = addDays(startDate, config.windowDays - 1);

  // ---- Listings -----------------------------------------------------------
  // Pull all (incl. inactive + MTL parents) so we can compute exclusion stats,
  // then dedupe via the canonical bookable-listings logic. MTL parents share
  // calendar + fees with their SLT children — auditing both = double-count.
  const { data: listingsRaw } = await sb
    .from('guesty_listings')
    .select('id, nickname, building_code, bedrooms, accommodates, active, master_listing_id');

  type LRow = {
    id: string;
    nickname: string | null;
    building_code: string | null;
    bedrooms: number | null;
    accommodates: number | null;
    active: boolean | null;
    master_listing_id: string | null;
  };
  const allRaw = (listingsRaw as LRow[] | null) || [];
  const totalActive = allRaw.filter(l => l.active === true).length;

  // Build the parent-id set — listings that ARE master_listing_ids of others.
  const parentIds = new Set<string>();
  for (const l of allRaw) {
    if (l.master_listing_id) parentIds.add(l.master_listing_id);
  }
  let mtlParentsExcluded = 0;
  let listings = allRaw.filter(l => {
    if (l.active !== true) return false;
    if (parentIds.has(l.id)) {
      mtlParentsExcluded += 1;
      return false;
    }
    return true;
  });

  if (config.buildings.length) {
    const set = new Set(config.buildings);
    listings = listings.filter(l => set.has(bucketBuilding(l.building_code)));
  }
  if (config.bedroomFilter?.length) {
    const set = new Set(config.bedroomFilter);
    listings = listings.filter(l => set.has(l.bedrooms || 0));
  }

  const listingIds = listings.map(l => l.id);
  const physicalUnits = listings.length;

  // ---- Listing terms ------------------------------------------------------
  const { data: termsRaw } = await sb
    .from('beithady_listing_terms')
    .select('*')
    .in('listing_id', listingIds.length ? listingIds : ['none']);
  type TermsRow = { listing_id: string } & Record<string, unknown>;
  const termsMap = new Map<string, TermsRow>(
    ((termsRaw as TermsRow[] | null) || []).map(t => [t.listing_id, t] as const)
  );

  // ---- Daily rates -------------------------------------------------------
  const { data: dailyRaw } = await sb
    .from('beithady_pricelabs_daily_rates')
    .select('*')
    .in('listing_id', listingIds.length ? listingIds : ['none'])
    .gte('date', startDate)
    .lte('date', endDate);
  type DRow = {
    listing_id: string; date: string; base_price: number | null;
    is_weekend: boolean | null; is_blocked: boolean | null;
    weekly_discount_pct: number | null; monthly_discount_pct: number | null;
    last_minute_discount_pct: number | null; channel_overrides: Record<string, number> | null;
    currency: string | null;
  };
  const dailyByListing = new Map<string, DRow[]>();
  for (const d of (dailyRaw as DRow[] | null) || []) {
    const arr = dailyByListing.get(d.listing_id) || [];
    arr.push(d);
    dailyByListing.set(d.listing_id, arr);
  }
  if (config.bathroomFilter?.length) {
    const set = new Set(config.bathroomFilter);
    listings = listings.filter(l => {
      const t = termsMap.get(l.id) as { bathrooms?: number } | undefined;
      return set.has(Math.round(Number(t?.bathrooms || 0)));
    });
  }

  // ---- Build ListingMeta --------------------------------------------------
  const listingMetas: ListingMeta[] = listings.map(l => {
    const t = termsMap.get(l.id) as
      | (Record<string, unknown> & { bathrooms?: number; cleaning_fee?: number; security_deposit?: number; pet_fee?: number; extra_guest_fee?: number; extra_guest_threshold?: number; min_nights_default?: number; min_nights_per_channel?: Record<string, number>; max_nights?: number; prep_time_hours?: number; advance_notice_hours?: number; taxes?: unknown })
      | undefined;
    const dailyCount = (dailyByListing.get(l.id) || []).length;
    const missing: string[] = [];
    if (!t) missing.push('terms not synced');
    if (dailyCount < config.windowDays) missing.push(`only ${dailyCount}/${config.windowDays} forward days synced`);

    return {
      id: l.id,
      nickname: l.nickname || l.id.slice(0, 8),
      building: bucketBuilding(l.building_code),
      bedrooms: l.bedrooms || 0,
      bathrooms: t?.bathrooms != null ? Number(t.bathrooms) : null,
      capacity: l.accommodates || 0,
      cleaning_fee: t?.cleaning_fee != null ? Number(t.cleaning_fee) : null,
      security_deposit: t?.security_deposit != null ? Number(t.security_deposit) : null,
      pet_fee: t?.pet_fee != null ? Number(t.pet_fee) : null,
      extra_guest_fee: t?.extra_guest_fee != null ? Number(t.extra_guest_fee) : null,
      extra_guest_threshold: t?.extra_guest_threshold ?? null,
      min_nights_default: t?.min_nights_default ?? null,
      min_nights_per_channel: (t?.min_nights_per_channel as Record<string, number>) || {},
      max_nights: t?.max_nights ?? null,
      prep_time_hours: t?.prep_time_hours ?? null,
      advance_notice_hours: t?.advance_notice_hours ?? null,
      taxes: (t?.taxes as Array<{ type: string; rate_pct?: number; amount?: number; applies_to?: string }>) || [],
      has_full_data: missing.length === 0,
      missing_data_reasons: missing,
    };
  });

  // ---- Daily cells with per-channel breakdowns ---------------------------
  const dailyCells: DailyCell[] = [];
  for (const lst of listingMetas) {
    const days = dailyByListing.get(lst.id) || [];
    for (const d of days) {
      const perCh: DailyCell['per_channel'] = [];
      for (const ch of channels) {
        try {
          const breakdown = await quoteStay({
            listingId: lst.id,
            channel: ch,
            dateIso: d.date,
            nights: 1,
            guests: lst.capacity || 2,
          });
          perCh.push({
            channel: ch,
            guest_gross_usd: breakdown.total_guest_pays_usd,
            host_net_usd: breakdown.total_host_receives_usd,
            breakdown,
          });
        } catch {
          perCh.push({ channel: ch, guest_gross_usd: null, host_net_usd: null, breakdown: emptyBreakdown() });
        }
      }
      dailyCells.push({
        listing_id: lst.id,
        date: d.date,
        base_price_usd: d.base_price,
        is_weekend: !!d.is_weekend,
        is_blocked: !!d.is_blocked,
        weekly_discount_pct: d.weekly_discount_pct,
        monthly_discount_pct: d.monthly_discount_pct,
        last_minute_discount_pct: d.last_minute_discount_pct,
        per_channel: perCh,
      });
    }
  }

  // ---- Anomalies ---------------------------------------------------------
  const anomalies = detectAnomalies(listingMetas, dailyCells, channels);

  // ---- Totals ------------------------------------------------------------
  const validRates = dailyCells
    .map(d => d.base_price_usd)
    .filter((v): v is number => v != null && v > 0);
  const validCleaning = listingMetas
    .map(l => l.cleaning_fee)
    .filter((v): v is number => v != null && v > 0);
  const validTaxPct = listingMetas
    .filter(l => l.taxes.length)
    .map(l =>
      l.taxes
        .filter(t => typeof t.rate_pct === 'number')
        .reduce((s, t) => s + (t.rate_pct || 0), 0)
    );
  const validMinNights = listingMetas
    .map(l => l.min_nights_default)
    .filter((v): v is number => v != null && v > 0);

  const sevCount = { critical: 0, warning: 0, info: 0 } as Record<
    'critical' | 'warning' | 'info',
    number
  >;
  for (const a of anomalies) sevCount[a.severity] += 1;

  if (listingMetas.filter(l => !l.has_full_data).length === listingMetas.length) {
    warnings.push(
      'All listings are missing terms or forward calendar — run sync first.'
    );
  }

  return {
    config,
    runAt: new Date().toISOString(),
    listings: listingMetas,
    daily: dailyCells,
    anomalies,
    totals: {
      avg_daily_rate_usd: avg(validRates),
      avg_cleaning_usd: avg(validCleaning),
      avg_total_tax_pct: avg(validTaxPct),
      avg_min_nights: avg(validMinNights),
      listings_with_missing_data: listingMetas.filter(l => !l.has_full_data).length,
      anomaly_count_by_severity: sevCount,
      physical_units: physicalUnits,
      total_active_listings: totalActive,
      mtl_parents_excluded: mtlParentsExcluded,
    },
    warnings: warnings.length ? warnings : undefined,
  };
}

function emptyBreakdown(): import('./types').FeeBreakdown {
  return {
    base_rate_total_usd: 0,
    weekend_uplift_usd: 0,
    cleaning_usd: 0,
    pet_usd: 0,
    extra_guest_usd: 0,
    taxes_usd: 0,
    taxes_breakdown: [],
    channel_commission_usd: 0,
    guest_service_fee_usd: 0,
    security_deposit_usd: 0,
    total_guest_pays_usd: 0,
    total_host_receives_usd: 0,
    min_nights_required: null,
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}
