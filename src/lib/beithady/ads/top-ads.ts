import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';
import { asInt } from './insights-utils';

export type TopAdSortBy = 'leads' | 'ctr' | 'cpl';

export type TopAdRow = {
  ad_id: number;
  ad_name: string;
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  impressions: number;
  clicks: number;
  ctr_pct: number;
  spend_egp: number;
  leads: number;
  cpl_egp: number | null;
};

export function sortTopAds(rows: TopAdRow[], sortBy: TopAdSortBy, limit = 20): TopAdRow[] {
  const filtered = sortBy === 'cpl' ? rows.filter(r => r.cpl_egp != null) : rows;
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'leads') return b.leads - a.leads;
    if (sortBy === 'ctr') return b.ctr_pct - a.ctr_pct;
    return (a.cpl_egp ?? Infinity) - (b.cpl_egp ?? Infinity);  // cpl asc
  });
  return sorted.slice(0, limit);
}

export async function getTopAds(opts: {
  from: string;
  to: string;
  sortBy: TopAdSortBy;
  limit?: number;
  buildingCode?: string;   // accepted for API symmetry; only relevant when leads filter applied below
}): Promise<TopAdRow[]> {
  const sb = supabaseAdmin();

  // ad-level rows: ad_id IS NOT NULL in ads_daily_metrics
  const { data: metricRows, error: mErr } = await sb
    .from('ads_daily_metrics')
    .select('ad_id, account_id, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from).lte('metric_date', opts.to)
    .not('ad_id', 'is', null);
  if (mErr) { console.error('[top-ads] metrics query failed:', mErr); return []; }
  type MetricRow = { ad_id: number; account_id: number; impressions: number; clicks: number; spend_micros: number | string; leads: number };
  const metrics = (metricRows as MetricRow[] | null) ?? [];

  // Aggregate per ad_id
  const perAd = new Map<number, { account_id: number; impressions: number; clicks: number; spend_micros: number; leads: number }>();
  for (const m of metrics) {
    const cur = perAd.get(m.ad_id) ?? { account_id: m.account_id, impressions: 0, clicks: 0, spend_micros: 0, leads: 0 };
    cur.impressions += asInt(m.impressions);
    cur.clicks += asInt(m.clicks);
    cur.spend_micros += Number(m.spend_micros) || 0;
    cur.leads += asInt(m.leads);
    perAd.set(m.ad_id, cur);
  }

  const adIds = Array.from(perAd.keys());
  if (adIds.length === 0) return [];

  // Join ads_ads + ads_campaigns for names + platform
  const { data: adRows } = await sb
    .from('ads_ads')
    .select('id, name, platform, ad_set_id, ads_ad_sets(campaign_id, ads_campaigns(id, name))')
    .in('id', adIds);
  type AdJoinRow = {
    id: number; name: string; platform: 'meta'|'google'|'tiktok';
    ads_ad_sets?: { campaign_id: number; ads_campaigns?: { id: number; name: string } | null } | null;
  };
  const adsList = (adRows as unknown as AdJoinRow[] | null) ?? [];

  const { data: accounts } = await sb.from('ads_accounts').select('id, currency');
  const currencyByAccount = new Map<number, string>();
  for (const a of (accounts as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccount.set(a.id, a.currency);
  }

  // Build TopAdRow per ad
  const rows: TopAdRow[] = [];
  for (const ad of adsList) {
    const m = perAd.get(ad.id);
    if (!m) continue;
    const currency = currencyByAccount.get(m.account_id) ?? 'USD';
    const egpVals = await convertManyToEgp([{ amount: m.spend_micros / 1_000_000, currency }]);
    const spendEgp = Math.round(egpVals[0] || 0);
    const ctrPct = m.impressions > 0 ? Math.round((m.clicks / m.impressions) * 10000) / 100 : 0;
    rows.push({
      ad_id: ad.id,
      ad_name: ad.name,
      campaign_id: ad.ads_ad_sets?.campaign_id ?? 0,
      campaign_name: ad.ads_ad_sets?.ads_campaigns?.name ?? '—',
      platform: ad.platform,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr_pct: ctrPct,
      spend_egp: spendEgp,
      leads: m.leads,
      cpl_egp: m.leads > 0 ? Math.round((spendEgp / m.leads) * 100) / 100 : null,
    });
  }

  return sortTopAds(rows, opts.sortBy, opts.limit);
}
