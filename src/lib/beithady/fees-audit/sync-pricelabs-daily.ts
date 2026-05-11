// Beithady · Fee Audit · forward-window daily-rate sync.
// Calls PriceLabs /listings/prices for each listing and upserts per-day rows.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getPricelabsListingPrices,
  type PriceLabsListingPrice,
} from '@/lib/pricelabs';
import { getBookableListingIds } from '@/lib/beithady/bookable-listings';

export async function syncPricelabsDailyRates(opts: {
  daysAhead?: number;
}): Promise<{
  listings: number;
  rows: number;
  errors: string[];
  slt_children_excluded: number;
  /** PriceLabs returned a day with null price (no rate pushed) — we skip
   *  the upsert so bootstrap values survive. Surfaced for cron-log visibility. */
  null_price_days_skipped: number;
}> {
  const sb = supabaseAdmin();
  const daysAhead = opts.daysAhead ?? 30;
  const errors: string[] = [];

  // Source of truth for "which listings to sync" = standalones + MTL parents.
  // SLT children share calendar with their parent → syncing both wastes
  // PriceLabs API quota and writes duplicate daily-rate rows.
  const bookableIds = new Set(await getBookableListingIds());

  const { data: listings } = await sb
    .from('pricelabs_listings')
    .select('id')
    .eq('push_enabled', true)
    .eq('is_hidden', false);
  // Cross-filter: PriceLabs side must ALSO be in our active+deduped set.
  const allPlIds = ((listings as Array<{ id: string }> | null) || []).map(l => l.id);
  const ids = allPlIds.filter(id => bookableIds.has(id));
  const childrenExcluded = allPlIds.length - ids.length;
  if (ids.length === 0) {
    return {
      listings: 0,
      rows: 0,
      errors: [],
      slt_children_excluded: childrenExcluded,
      null_price_days_skipped: 0,
    };
  }

  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + daysAhead * 86400000)
    .toISOString()
    .slice(0, 10);

  let rowsWritten = 0;
  let nullPriceSkipped = 0;
  for (const id of ids) {
    try {
      const resp = await getPricelabsListingPrices(id, {
        dateFrom: start,
        dateTo: end,
      });
      const days = (resp.data || []) as PriceLabsListingPrice[];
      // Filter out days where PriceLabs returned no rate. Upserting with
      // base_price: null would wipe MTL-parent bootstrap rows (2026-05-11):
      // for the 8 BH-73 parents PriceLabs has the listing registered but no
      // rates pushed, so the response is `{date, price: null}`. We bootstrap
      // those rows from peer medians; this skip keeps them intact until
      // PriceLabs actually has rates to push.
      const upserts = days
        .map(d => {
          const dt = new Date(d.date + 'T00:00:00Z');
          const dow = dt.getUTCDay();
          const isWeekend = dow === 5 || dow === 6;
          const basePrice = d.price ?? d.recommended_rate ?? null;
          return basePrice == null
            ? null
            : {
                listing_id: id,
                date: d.date,
                base_price: basePrice,
                min_price: null,
                max_price: null,
                currency: 'USD',
                is_weekend: isWeekend,
                is_blocked: false,
                weekly_discount_pct: null,
                monthly_discount_pct: null,
                last_minute_discount_pct: null,
                channel_overrides: null,
                raw: d as Record<string, unknown>,
                synced_at: new Date().toISOString(),
              };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      nullPriceSkipped += days.length - upserts.length;
      if (upserts.length) {
        const { error } = await sb
          .from('beithady_pricelabs_daily_rates')
          .upsert(upserts, { onConflict: 'listing_id,date' });
        if (error) errors.push(`${id}: ${error.message}`);
        else rowsWritten += upserts.length;
      }
      await new Promise(r => setTimeout(r, 1100)); // PriceLabs rate limit
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    listings: ids.length,
    rows: rowsWritten,
    errors,
    slt_children_excluded: childrenExcluded,
    null_price_days_skipped: nullPriceSkipped,
  };
}
