import { supabaseAdmin } from './supabase';
import {
  listPricelabsListings,
  getPricelabsListing,
  type PriceLabsListing,
} from './pricelabs';
import {
  fetchNeighborhoodForListing,
  classifyConfidence,
  bedroomBucket,
} from './pricelabs-neighborhood';

const THROTTLE_MS = 400; // ~150 req/min ceiling is PL's 60/min — 400ms spacing → 150/min max burst; we stay well under.

// Normalize '14 %' or '14%' or '14' → 14 (numeric). Returns null if unparseable.
function parsePct(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/%/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseNumeric(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Identify a canonical-5 building code from a single token. Returns null
// for unit-level codes like BH-435-303 so the caller can keep looking for
// a cleaner tag (e.g. the sibling "BH-435" tag on the same listing).
function exactBuildingTag(tag: string | null): string | null {
  if (!tag) return null;
  const up = tag.toUpperCase().replace(/\s+/g, '');
  const m = /^BH[-]?(26|34|73|435)$/.exec(up);
  if (m) return `BH-${m[1]}`;
  if (/^BH[-]?(OK|OKAT)$/.test(up)) return 'BH-OK';
  return null;
}

function extractBuildingCode(
  tags: string | null | undefined,
  name: string | null | undefined
): string | null {
  const tagList = String(tags || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Pass 1: prefer an EXACT canonical tag (BH-26 / BH-435 / BH-OK / …).
  for (const t of tagList) {
    const code = exactBuildingTag(t);
    if (code) return code;
  }

  // Pass 2: any unit-level BH-\d tag means the listing belongs to One
  // Kattameya's scatter-unit portfolio. We accept unit-level codes from
  // the main buildings too (BH-26-001 → BH-26) by stripping the suffix.
  for (const t of tagList) {
    const m = /^BH[-\s]?(26|34|73|435)(?:[-\s]|$)/i.exec(t);
    if (m) return `BH-${m[1]}`;
  }
  for (const t of tagList) {
    if (/^BH[-\s]?\d/i.test(t)) return 'BH-OK';
  }

  // Fallback: parse the listing name.
  const nameMajor = /\bBH[-\s]?(26|34|73|435)(?:[-\s]|$)/i.exec(name || '');
  if (nameMajor) return `BH-${nameMajor[1]}`;
  if (/\bBH[-\s]?(OK|OKAT)/i.test(name || '')) return 'BH-OK';
  if (/\bBH[-\s]?\d/i.test(name || '')) return 'BH-OK';
  return null;
}

export async function runPricelabsSync(trigger: 'cron' | 'manual') {
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('pricelabs_sync_runs')
    .insert({ trigger, status: 'running' })
    .select()
    .single();
  if (runErr || !run) {
    return { ok: false, error: 'failed_to_open_run', details: runErr };
  }

  const runId = (run as { id: string }).id;
  const today = new Date().toISOString().slice(0, 10);
  let listingsSynced = 0;
  let snapshotsWritten = 0;
  let channelsSynced = 0;

  try {
    // 1. Catalog
    const catalog = await listPricelabsListings();

    // 2. Walk each listing, fetch detail, upsert listing row + snapshot +
    // channel rows. Serialized with THROTTLE_MS spacing to be well under
    // PL's 60/min limit.
    for (const c of catalog) {
      const detail: PriceLabsListing | null = await getPricelabsListing(c.id);
      await new Promise(r => setTimeout(r, THROTTLE_MS));

      // Prefer detail fields; fall back to catalog if detail failed.
      const d: PriceLabsListing = detail || c;
      const buildingCode = extractBuildingCode(
        (d.tags as string | undefined) ?? null,
        d.name ?? null
      );

      await sb.from('pricelabs_listings').upsert(
        {
          id: d.id,
          name: d.name || null,
          pms: d.pms || null,
          bedrooms: d.no_of_bedrooms ?? null,
          push_enabled: d.push_enabled ?? null,
          is_hidden: d.isHidden ?? null,
          group_name: d.group || null,
          subgroup: d.subgroup ?? null,
          tags: d.tags || null,
          building_code: buildingCode,
          city_name: d.city_name || d.city || null,
          country: d.country || null,
          latitude: parseNumeric(d.latitude),
          longitude: parseNumeric(d.longitude),
          cleaning_fees: parseNumeric(d.cleaning_fees),
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      listingsSynced++;

      // Only write a snapshot when we got rich detail (skip if detail
      // fetch failed and we're falling back to the thin catalog row).
      if (detail) {
        const recBase = detail.recommended_base_price;
        const recBaseNumeric =
          typeof recBase === 'number' && Number.isFinite(recBase)
            ? recBase
            : null;
        const recBaseUnavailable =
          typeof recBase === 'string' && /unavail|n\/?a/i.test(recBase);

        await sb.from('pricelabs_listing_snapshots').upsert(
          {
            listing_id: d.id,
            snapshot_date: today,
            base: parseNumeric(detail.base ?? detail.base_price),
            min_price: parseNumeric(detail.min ?? detail.min_price),
            max_price: parseNumeric(detail.max ?? detail.max_price),
            adr_past_30: parseNumeric(detail.adr_past_30),
            stly_adr_past_30: parseNumeric(detail.stly_adr_past_30),
            revenue_past_30: parseNumeric(detail.revenue_past_30),
            stly_revenue_past_30: parseNumeric(detail.stly_revenue_past_30),
            booking_pickup_past_30: parseNumeric(
              detail.booking_pickup_past_30
            ),
            occupancy_next_7: parsePct(detail.occupancy_next_7),
            market_occupancy_next_7: parsePct(detail.market_occupancy_next_7),
            occupancy_next_30: parsePct(detail.occupancy_next_30),
            market_occupancy_next_30: parsePct(
              detail.market_occupancy_next_30
            ),
            occupancy_next_60: parsePct(detail.occupancy_next_60),
            market_occupancy_next_60: parsePct(
              detail.market_occupancy_next_60
            ),
            recommended_base_price: recBaseNumeric,
            rec_base_unavailable: recBaseUnavailable,
            last_date_pushed:
              typeof detail.last_date_pushed === 'string'
                ? detail.last_date_pushed
                : null,
            last_refreshed_at:
              typeof detail.last_refreshed_at === 'string'
                ? detail.last_refreshed_at
                : null,
            raw: (detail as unknown) as Record<string, unknown>,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'listing_id,snapshot_date' }
        );
        snapshotsWritten++;

        // Channels
        const channels = Array.isArray(detail.channel_listing_details)
          ? detail.channel_listing_details
          : [];
        if (channels.length > 0) {
          const rows = channels.map(ch => ({
            listing_id: d.id,
            channel_name: String(ch.channel_name || '').trim(),
            channel_listing_id: String(ch.channel_listing_id || ''),
            last_synced_at: new Date().toISOString(),
          }));
          await sb
            .from('pricelabs_channels')
            .upsert(rows, { onConflict: 'listing_id,channel_name' });
          channelsSynced += rows.length;
        }
      }
    }

    // Phase v3 — Pricing Intelligence neighborhood pull.
    // Per-listing comp set + aggregated per-(building, bedroom-bucket).
    // Drops gracefully if the neighborhood endpoint isn't on tier
    // (P6=A): writes neighborhood_endpoint_available=false on the run.
    let neighborhood_listings_synced = 0;
    let neighborhood_endpoint_available: boolean | null = null;
    let market_snapshots_written = 0;
    try {
      // 1. Pull neighborhood data for each (active, push-enabled) listing
      type ListingMeta = {
        id: string;
        name: string | null;
        bedrooms: number | null;
        building_code: string | null;
        push_enabled: boolean | null;
        is_hidden: boolean | null;
      };
      const { data: listingRows } = await sb
        .from('pricelabs_listings')
        .select('id, name, bedrooms, building_code, push_enabled, is_hidden');
      const listings = (listingRows as ListingMeta[] | null) || [];
      const eligible = listings.filter(l => !l.is_hidden);

      for (const lst of eligible) {
        const r = await fetchNeighborhoodForListing(lst.id);
        if (!r.endpoint_available) {
          // First call returned 404 / not-found. Endpoint is not on
          // this tier (P6=A). Mark unavailable and stop probing.
          neighborhood_endpoint_available = false;
          break;
        }
        neighborhood_endpoint_available = true;
        if (!r.ok || !r.data) continue;

        const conf = classifyConfidence(r.data.comp_set_size);
        await sb
          .from('pricelabs_neighborhood_snapshots')
          .upsert(
            {
              listing_id: lst.id,
              snapshot_date: today,
              bedrooms: lst.bedrooms,
              comp_set_size: r.data.comp_set_size,
              comp_median_price: r.data.comp_median_price,
              comp_mean_price: r.data.comp_mean_price,
              comp_p25_price: r.data.comp_p25_price,
              comp_p75_price: r.data.comp_p75_price,
              comp_median_weekday: r.data.comp_median_weekday,
              comp_median_weekend: r.data.comp_median_weekend,
              comp_occupancy_pct: r.data.comp_occupancy_pct,
              comp_lead_time_days: r.data.comp_lead_time_days,
              comp_avg_rating: r.data.comp_avg_rating,
              comp_rating_sample_size: r.data.comp_rating_sample_size,
              currency: r.data.currency,
              confidence: conf,
              raw: r.data.raw as Record<string, unknown>,
              synced_at: new Date().toISOString(),
            },
            { onConflict: 'listing_id,snapshot_date' }
          );
        neighborhood_listings_synced += 1;
        await new Promise(r2 => setTimeout(r2, THROTTLE_MS));
      }

      // 2. Compute aggregated per-(building, bedroom-bucket) snapshot.
      // Pull today's per-listing snapshots + the matching listing
      // snapshots (for our_avg_base + our_avg_adr_past_30 + our_avg_occ).
      if (neighborhood_endpoint_available) {
        type AggListing = {
          id: string;
          building_code: string | null;
          bedrooms: number | null;
          base: number | string | null;
          adr_past_30: number | string | null;
          occupancy_next_30: number | string | null;
          stly_adr_past_30: number | string | null;
        };
        const { data: ours } = await sb
          .from('pricelabs_listing_snapshots')
          .select(
            'listing_id, base, adr_past_30, occupancy_next_30, stly_adr_past_30, listing:pricelabs_listings!inner(id, building_code, bedrooms)'
          )
          .eq('snapshot_date', today);
        const ourMap = new Map<string, AggListing>();
        for (const row of (ours as unknown as Array<{
          listing_id: string;
          base: number | string | null;
          adr_past_30: number | string | null;
          occupancy_next_30: number | string | null;
          stly_adr_past_30: number | string | null;
          listing: { id: string; building_code: string | null; bedrooms: number | null } | null;
        }> | null) || []) {
          ourMap.set(row.listing_id, {
            id: row.listing_id,
            building_code: row.listing?.building_code || null,
            bedrooms: row.listing?.bedrooms || null,
            base: row.base,
            adr_past_30: row.adr_past_30,
            occupancy_next_30: row.occupancy_next_30,
            stly_adr_past_30: row.stly_adr_past_30,
          });
        }

        type NSRow = {
          listing_id: string;
          comp_set_size: number | null;
          comp_median_price: number | null;
          comp_median_weekday: number | null;
          comp_median_weekend: number | null;
          comp_avg_rating: number | null;
          comp_occupancy_pct: number | null;
        };
        const { data: nbhood } = await sb
          .from('pricelabs_neighborhood_snapshots')
          .select(
            'listing_id, comp_set_size, comp_median_price, comp_median_weekday, comp_median_weekend, comp_avg_rating, comp_occupancy_pct'
          )
          .eq('snapshot_date', today);

        // Aggregate by (building, bedroom_bucket)
        type Agg = {
          our_base_sum: number;
          our_base_n: number;
          our_adr_sum: number;
          our_adr_n: number;
          our_occ_sum: number;
          our_occ_n: number;
          stly_adr_sum: number;
          stly_adr_n: number;
          comp_median_sum: number;
          comp_median_n: number;
          comp_weekday_sum: number;
          comp_weekday_n: number;
          comp_weekend_sum: number;
          comp_weekend_n: number;
          comp_rating_sum: number;
          comp_rating_n: number;
          comp_occ_sum: number;
          comp_occ_n: number;
          comp_set_size_sum: number;
          unit_count: number;
        };
        const byKey = new Map<string, Agg>();
        const upd = (k: string) =>
          byKey.get(k) ||
          (() => {
            const fresh: Agg = {
              our_base_sum: 0, our_base_n: 0,
              our_adr_sum: 0, our_adr_n: 0,
              our_occ_sum: 0, our_occ_n: 0,
              stly_adr_sum: 0, stly_adr_n: 0,
              comp_median_sum: 0, comp_median_n: 0,
              comp_weekday_sum: 0, comp_weekday_n: 0,
              comp_weekend_sum: 0, comp_weekend_n: 0,
              comp_rating_sum: 0, comp_rating_n: 0,
              comp_occ_sum: 0, comp_occ_n: 0,
              comp_set_size_sum: 0,
              unit_count: 0,
            };
            byKey.set(k, fresh);
            return fresh;
          })();

        const nbhoodById = new Map(
          ((nbhood as unknown as NSRow[] | null) || []).map(r => [r.listing_id, r])
        );

        for (const our of ourMap.values()) {
          const building = our.building_code;
          if (!building) continue;
          if (!['BH-26', 'BH-73', 'BH-435', 'BH-OK'].includes(building)) continue;
          const bucket = bedroomBucket(our.bedrooms);
          const key = `${building}||${bucket}`;
          const a = upd(key);
          a.unit_count += 1;
          const base = parseNumeric(our.base);
          const adr = parseNumeric(our.adr_past_30);
          const occ = parsePct(our.occupancy_next_30);
          const stly = parseNumeric(our.stly_adr_past_30);
          if (base != null) { a.our_base_sum += base; a.our_base_n += 1; }
          if (adr != null) { a.our_adr_sum += adr; a.our_adr_n += 1; }
          if (occ != null) { a.our_occ_sum += occ; a.our_occ_n += 1; }
          if (stly != null) { a.stly_adr_sum += stly; a.stly_adr_n += 1; }

          const ns = nbhoodById.get(our.id);
          if (ns) {
            if (ns.comp_median_price != null) {
              a.comp_median_sum += ns.comp_median_price;
              a.comp_median_n += 1;
            }
            if (ns.comp_median_weekday != null) {
              a.comp_weekday_sum += ns.comp_median_weekday;
              a.comp_weekday_n += 1;
            }
            if (ns.comp_median_weekend != null) {
              a.comp_weekend_sum += ns.comp_median_weekend;
              a.comp_weekend_n += 1;
            }
            if (ns.comp_avg_rating != null) {
              a.comp_rating_sum += ns.comp_avg_rating;
              a.comp_rating_n += 1;
            }
            if (ns.comp_occupancy_pct != null) {
              a.comp_occ_sum += ns.comp_occupancy_pct;
              a.comp_occ_n += 1;
            }
            if (ns.comp_set_size != null) {
              a.comp_set_size_sum += ns.comp_set_size;
            }
          }
        }

        // Persist aggregated rows with alert classification.
        for (const [key, a] of byKey.entries()) {
          const [building_code, bedroom_bucket] = key.split('||');
          const our_avg_base = a.our_base_n ? a.our_base_sum / a.our_base_n : null;
          const our_avg_adr = a.our_adr_n ? a.our_adr_sum / a.our_adr_n : null;
          const our_avg_occ = a.our_occ_n ? a.our_occ_sum / a.our_occ_n : null;
          const stly_avg = a.stly_adr_n ? a.stly_adr_sum / a.stly_adr_n : null;
          const comp_median = a.comp_median_n ? a.comp_median_sum / a.comp_median_n : null;
          const comp_weekday = a.comp_weekday_n ? a.comp_weekday_sum / a.comp_weekday_n : null;
          const comp_weekend = a.comp_weekend_n ? a.comp_weekend_sum / a.comp_weekend_n : null;
          const comp_rating = a.comp_rating_n ? a.comp_rating_sum / a.comp_rating_n : null;
          const comp_occ = a.comp_occ_n ? a.comp_occ_sum / a.comp_occ_n : null;
          const comp_set_size = a.our_base_n ? Math.round(a.comp_set_size_sum / a.our_base_n) : 0;

          const delta_pct =
            our_avg_base != null && comp_median && comp_median > 0
              ? ((our_avg_base - comp_median) / comp_median) * 100
              : null;
          const stly_delta_pct =
            our_avg_adr != null && stly_avg && stly_avg > 0
              ? ((our_avg_adr - stly_avg) / stly_avg) * 100
              : null;

          // Alert classification (P1 thresholds + SP6 confidence + SP8
          // occupancy-aware suppression).
          let alert_level: string;
          if (comp_set_size < 5) alert_level = 'insufficient';
          else if (delta_pct == null) alert_level = 'in_band';
          else if (delta_pct < 0 && (our_avg_occ ?? 0) >= 90)
            alert_level = 'suppressed_occ_high';
          else if (delta_pct > 0 && (our_avg_occ ?? 100) < 40 && (comp_occ ?? 100) < 50)
            alert_level = 'suppressed_market_slow';
          else if (delta_pct < -20) alert_level = 'critical_under';
          else if (delta_pct < -10) alert_level = 'warn_under';
          else if (delta_pct > 20) alert_level = 'critical_over';
          else if (delta_pct > 10) alert_level = 'warn_over';
          else alert_level = 'in_band';

          // Recommended price (SP2): aim for 95–105% of comp median.
          let recommended_price_usd: number | null = null;
          if (comp_median != null && delta_pct != null) {
            if (delta_pct < -10) recommended_price_usd = Math.round(comp_median * 0.95 * 100) / 100;
            else if (delta_pct > 10) recommended_price_usd = Math.round(comp_median * 1.05 * 100) / 100;
            else recommended_price_usd = our_avg_base; // hold
          }

          await sb
            .from('pricelabs_market_snapshots')
            .upsert(
              {
                snapshot_date: today,
                building_code,
                bedroom_bucket,
                unit_count: a.unit_count,
                our_avg_base_usd: our_avg_base,
                our_avg_adr_past_30_usd: our_avg_adr,
                our_avg_review_rating: null, // wired from guesty_reviews in a follow-up
                our_avg_occupancy_pct: our_avg_occ,
                comp_median_usd: comp_median,
                comp_median_weekday_usd: comp_weekday,
                comp_median_weekend_usd: comp_weekend,
                comp_avg_rating: comp_rating,
                comp_set_size,
                comp_occupancy_pct: comp_occ,
                delta_pct: delta_pct != null ? Math.round(delta_pct * 10) / 10 : null,
                stly_delta_pct: stly_delta_pct != null ? Math.round(stly_delta_pct * 10) / 10 : null,
                alert_level,
                recommended_price_usd,
                synced_at: new Date().toISOString(),
              },
              { onConflict: 'snapshot_date,building_code,bedroom_bucket' }
            );
          market_snapshots_written += 1;
        }
      }
    } catch {
      // Neighborhood pull errors are non-fatal — main sync continues.
    }

    await sb
      .from('pricelabs_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        listings_synced: listingsSynced,
        snapshots_written: snapshotsWritten,
        channels_synced: channelsSynced,
        neighborhood_listings_synced,
        neighborhood_endpoint_available,
        market_snapshots_written,
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      listings_synced: listingsSynced,
      snapshots_written: snapshotsWritten,
      channels_synced: channelsSynced,
      neighborhood_listings_synced,
      neighborhood_endpoint_available,
      market_snapshots_written,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('pricelabs_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: msg,
        listings_synced: listingsSynced,
        snapshots_written: snapshotsWritten,
        channels_synced: channelsSynced,
      })
      .eq('id', runId);
    return { ok: false, error: msg };
  }
}
