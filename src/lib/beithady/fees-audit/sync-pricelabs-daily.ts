// Beithady · Fee Audit · forward-window daily-rate sync.
// Calls PriceLabs /listings/prices for each listing and upserts per-day rows.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getPricelabsListingPrices,
  type PriceLabsListingPrice,
} from '@/lib/pricelabs';

export async function syncPricelabsDailyRates(opts: {
  daysAhead?: number;
}): Promise<{ listings: number; rows: number; errors: string[] }> {
  const sb = supabaseAdmin();
  const daysAhead = opts.daysAhead ?? 30;
  const errors: string[] = [];

  const { data: listings } = await sb
    .from('pricelabs_listings')
    .select('id')
    .eq('push_enabled', true);
  const ids = ((listings as Array<{ id: string }> | null) || []).map(l => l.id);
  if (ids.length === 0) return { listings: 0, rows: 0, errors: [] };

  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + daysAhead * 86400000)
    .toISOString()
    .slice(0, 10);

  let rowsWritten = 0;
  for (const id of ids) {
    try {
      const resp = await getPricelabsListingPrices(id, {
        dateFrom: start,
        dateTo: end,
      });
      const days = (resp.data || []) as PriceLabsListingPrice[];
      const upserts = days.map(d => {
        const dt = new Date(d.date + 'T00:00:00Z');
        const dow = dt.getUTCDay();
        const isWeekend = dow === 5 || dow === 6;
        return {
          listing_id: id,
          date: d.date,
          base_price: d.price ?? d.recommended_rate ?? null,
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
      });
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

  return { listings: ids.length, rows: rowsWritten, errors };
}
