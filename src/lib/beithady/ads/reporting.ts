import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';

// Read helpers for the Phase H Ads UI. Pulls from the views created
// by the migration plus the lead funnel.

export type RangeArg = number | { from: string; to: string };

export function normalizeRangeArg(arg: RangeArg, opts?: { today?: string }): { from: string; to: string } {
  const today = opts?.today ?? new Date().toISOString().slice(0, 10);
  if (typeof arg === 'number') {
    const fromMs = new Date(today + 'T00:00:00Z').getTime() - (arg - 1) * 86400e3;
    return { from: new Date(fromMs).toISOString().slice(0, 10), to: today };
  }
  return arg;
}

export type CampaignPerformanceRow = {
  campaign_id: number;
  campaign_name: string;
  platform: string;
  account_name: string;
  account_currency: string;
  campaign_status: string | null;
  objective: string | null;
  building_codes: string[] | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  cpc: number | null;
  cpl: number | null;
  ctr_pct: number | null;
  first_date: string | null;
  last_date: string | null;
};

export type AssetPerformanceRow = {
  asset_id: string;
  building_code: string | null;
  public_url: string | null;
  ai_caption: string | null;
  category: string | null;
  ad_count: number;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr_pct: number | null;
  cpc: number | null;
  cpl: number | null;
};

export async function listAssetPerformance(opts: { buildingCode?: string; limit?: number } = {}): Promise<AssetPerformanceRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_asset_performance').select('*').order('leads', { ascending: false, nullsFirst: false }).limit(opts.limit ?? 100);
  if (opts.buildingCode) q = q.eq('building_code', opts.buildingCode);
  const { data } = await q;
  return (data as AssetPerformanceRow[] | null) || [];
}

export type CampaignBudgetState = {
  campaign_id: number;
  monthly_budget_cap_usd: number | null;
  auto_paused_at: string | null;
  auto_paused_reason: string | null;
};

export async function listCampaignBudgetStates(): Promise<CampaignBudgetState[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_campaigns')
    .select('id, monthly_budget_cap_usd, auto_paused_at, auto_paused_reason');
  return ((data as Array<{ id: number; monthly_budget_cap_usd: number | null; auto_paused_at: string | null; auto_paused_reason: string | null }> | null) || [])
    .map(r => ({
      campaign_id: r.id,
      monthly_budget_cap_usd: r.monthly_budget_cap_usd,
      auto_paused_at: r.auto_paused_at,
      auto_paused_reason: r.auto_paused_reason,
    }));
}

export type DailyOverviewRow = {
  metric_date: string;
  platform: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  cpl: number | null;
};

export type LeadFunnelRow = {
  lead_id: number;
  created_at: string;
  platform: string;
  campaign_id: number | null;
  campaign_name: string | null;
  building_codes: string[] | null;
  form_name: string | null;
  full_name: string | null;
  phone_e164: string | null;
  email: string | null;
  country: string | null;
  building_interest: string | null;
  beithady_guest_id: string | null;
  matched_reservation_id: string | null;
  matched_at: string | null;
  funnel_stage: 'new' | 'processed' | 'booked';
  booking_value: number | null;
  booking_currency: string | null;
  booking_check_in: string | null;
  // SLA tracking (joined separately since the view doesn't carry them)
  first_response_at?: string | null;
  sla_minutes?: number | null;
};

export async function listCampaigns(): Promise<CampaignPerformanceRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_campaign_performance')
    .select('*')
    .order('last_date', { ascending: false, nullsFirst: false });
  return ((data as CampaignPerformanceRow[] | null) || []);
}

export async function listOverviewByDay(range: RangeArg = 30): Promise<DailyOverviewRow[]> {
  const sb = supabaseAdmin();
  const { from, to } = normalizeRangeArg(range);
  const { data } = await sb
    .from('ads_overview_daily')
    .select('*')
    .gte('metric_date', from)
    .lte('metric_date', to)
    .order('metric_date', { ascending: true });
  return ((data as DailyOverviewRow[] | null) || []);
}

export async function listLeadFunnel(opts: { stage?: 'new' | 'processed' | 'booked'; limit?: number } = {}): Promise<LeadFunnelRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_lead_funnel').select('*').limit(opts.limit ?? 200);
  if (opts.stage) q = q.eq('funnel_stage', opts.stage);
  const { data } = await q;
  const rows = ((data as LeadFunnelRow[] | null) || []);
  // Attach SLA state (joined separately because the funnel view doesn't carry it)
  if (rows.length === 0) return rows;
  const ids = rows.map(r => r.lead_id);
  const { data: slaRaw } = await sb
    .from('ads_leads')
    .select('id, first_response_at')
    .in('id', ids);
  const slaById = new Map<number, string | null>();
  for (const r of (slaRaw as Array<{ id: number; first_response_at: string | null }> | null) || []) {
    slaById.set(r.id, r.first_response_at);
  }
  const now = Date.now();
  return rows.map(r => {
    const firstResponse = slaById.get(r.lead_id);
    return {
      ...r,
      first_response_at: firstResponse,
      sla_minutes: firstResponse
        ? Math.round((new Date(firstResponse).getTime() - new Date(r.created_at).getTime()) / 60_000)
        : Math.round((now - new Date(r.created_at).getTime()) / 60_000),
    };
  });
}

export async function getDashboardKpis(range: RangeArg = 30): Promise<{
  spend: number;
  leads: number;
  bookings: number;
  cpl: number | null;
  attributed_revenue: number;
  roas: number | null;
  active_campaigns: number;
  draft_campaigns: number;
}> {
  const sb = supabaseAdmin();
  const { from, to } = normalizeRangeArg(range);
  // ads_daily_metrics carries spend in the ad-account's native currency
  // (Meta=USD, Google=EGP, TikTok=USD). Group per-currency, convert each
  // currency's total to EGP once, then sum. ads_overview_daily is currency-
  // blind so we can't use it for accurate totals.
  const [{ data: dailyMetrics }, { data: accountsList }, { data: leads }, { count: active }, { count: drafts }] = await Promise.all([
    sb.from('ads_daily_metrics')
      .select('spend_micros, account_id, leads')
      .gte('metric_date', from)
      .lte('metric_date', to)
      .is('ad_id', null)
      .is('ad_set_id', null),
    sb.from('ads_accounts').select('id, currency'),
    sb.from('ads_lead_funnel').select('matched_reservation_id, booking_value, booking_currency').gte('created_at', from).lte('created_at', to + 'T23:59:59'),
    sb.from('ads_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    sb.from('ads_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'DRAFT'),
  ]);
  type LeadRollupRow = { matched_reservation_id: string | null; booking_value: number | null; booking_currency: string | null };
  // Build per-account currency map
  const currencyByAccountId = new Map<number, string>();
  for (const a of (accountsList as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccountId.set(a.id, a.currency);
  }
  // Sum spend per currency, then convert each currency total to EGP and sum.
  type MetricRow = { spend_micros: number | string; account_id: number; leads: number };
  const metricRows = (dailyMetrics as MetricRow[] | null) ?? [];
  const spendByCurrency: Record<string, number> = {};
  let leadCount = 0;
  for (const m of metricRows) {
    const curr = currencyByAccountId.get(m.account_id) ?? 'USD';
    spendByCurrency[curr] = (spendByCurrency[curr] ?? 0) + (Number(m.spend_micros) || 0) / 1_000_000;
    leadCount += Number(m.leads) || 0;
  }
  const egpSpendByCurrency = await convertManyToEgp(
    Object.entries(spendByCurrency).map(([currency, amount]) => ({ amount, currency }))
  );
  const spend = egpSpendByCurrency.reduce((s, n) => s + n, 0);
  const leadRows = (leads as LeadRollupRow[] | null) || [];
  const bookedRows = leadRows.filter(l => l.matched_reservation_id);
  const bookings = bookedRows.length;
  // Multi-currency conversion to EGP (BH operates in Egypt; ad accounts run EGP).
  // Goes via rate_to_usd then cross-converts USD→EGP.
  const egpAmounts = await convertManyToEgp(
    bookedRows.map(l => ({ amount: l.booking_value, currency: l.booking_currency }))
  );
  const attributedRevenue = egpAmounts.reduce((s, n) => s + n, 0);
  return {
    spend: Math.round(spend),
    leads: leadCount,
    bookings,
    cpl: leadCount > 0 ? Math.round((spend / leadCount) * 100) / 100 : null,
    attributed_revenue: Math.round(attributedRevenue),
    roas: spend > 0 ? Math.round((attributedRevenue / spend) * 100) / 100 : null,
    active_campaigns: active ?? 0,
    draft_campaigns: drafts ?? 0,
  };
}

// Per-campaign attributed revenue + ROAS, joined to the campaign performance view.
// Used by Performance tab. Revenue + spend both in EGP (multi-currency bookings
// cross-converted to EGP via fx_rates_usd → USD → EGP).
export type CampaignRoasRow = {
  campaign_id: number;
  campaign_name: string;
  platform: string;
  spend: number;
  leads: number;
  bookings: number;
  attributed_revenue: number;
  roas: number | null;          // attributed_revenue / spend
};

export async function listCampaignRoas(): Promise<CampaignRoasRow[]> {
  const sb = supabaseAdmin();
  const [{ data: perf }, { data: leads }] = await Promise.all([
    sb.from('ads_campaign_performance').select('campaign_id, campaign_name, platform, spend, leads, account_currency'),
    sb.from('ads_lead_funnel').select('campaign_id, matched_reservation_id, booking_value, booking_currency'),
  ]);
  type PerfRow = { campaign_id: number; campaign_name: string; platform: string; spend: number; leads: number; account_currency: string };
  type FunnelRow = { campaign_id: number | null; matched_reservation_id: string | null; booking_value: number | null; booking_currency: string | null };
  const perfRows = (perf as PerfRow[] | null) || [];
  const funnelRows = (leads as FunnelRow[] | null) || [];

  // Convert all booked rows to EGP once (batched against the FX cache).
  const booked = funnelRows.filter(l => l.campaign_id != null && l.matched_reservation_id);
  const egpAmounts = await convertManyToEgp(
    booked.map(l => ({ amount: l.booking_value, currency: l.booking_currency }))
  );

  const bookingsByCampaign: Record<number, { bookings: number; revenue: number }> = {};
  booked.forEach((l, i) => {
    const cid = l.campaign_id as number;
    const entry = bookingsByCampaign[cid] ||= { bookings: 0, revenue: 0 };
    entry.bookings += 1;
    entry.revenue += egpAmounts[i] || 0;
  });

  // Convert all campaign spends to EGP in one batch — spend is in the
  // ad account's native currency (Meta=USD, Google=EGP, TikTok=USD).
  const egpSpends = await convertManyToEgp(
    perfRows.map(p => ({ amount: Number(p.spend) || 0, currency: p.account_currency }))
  );

  return perfRows.map((p, i) => {
    const b = bookingsByCampaign[p.campaign_id] || { bookings: 0, revenue: 0 };
    const spend = egpSpends[i];
    return {
      campaign_id: p.campaign_id,
      campaign_name: p.campaign_name,
      platform: p.platform,
      spend,
      leads: Number(p.leads) || 0,
      bookings: b.bookings,
      attributed_revenue: Math.round(b.revenue),
      roas: spend > 0 ? Math.round((b.revenue / spend) * 100) / 100 : null,
    };
  });
}

// V3 D3: fetch current KPIs and (when compare=true) prior-period KPIs in one call.
// Lets the main page render <PeriodDeltaBadge /> next to each <Stat>.
export async function getDashboardKpisWithCompare(opts: {
  range: { from: string; to: string };
  compare: boolean;
}): Promise<{
  current: Awaited<ReturnType<typeof getDashboardKpis>>;
  prior: Awaited<ReturnType<typeof getDashboardKpis>> | null;
}> {
  // Lazy import to avoid circular dependency (date-range.ts → reporting.ts is hot-loaded).
  const { derivePriorPeriod } = await import('./date-range');
  if (!opts.compare) {
    const current = await getDashboardKpis({ from: opts.range.from, to: opts.range.to });
    return { current, prior: null };
  }
  const priorRange = derivePriorPeriod(opts.range);
  const [current, prior] = await Promise.all([
    getDashboardKpis({ from: opts.range.from, to: opts.range.to }),
    getDashboardKpis({ from: priorRange.from, to: priorRange.to }),
  ]);
  return { current, prior };
}
