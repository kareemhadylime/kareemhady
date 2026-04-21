import { supabaseAdmin } from './supabase';
import {
  listPricelabsListings,
  getPricelabsListing,
  type PriceLabsListing,
} from './pricelabs';

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

    await sb
      .from('pricelabs_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        listings_synced: listingsSynced,
        snapshots_written: snapshotsWritten,
        channels_synced: channelsSynced,
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      listings_synced: listingsSynced,
      snapshots_written: snapshotsWritten,
      channels_synced: channelsSynced,
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
