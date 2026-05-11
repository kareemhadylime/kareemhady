import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Read helpers for the Phase H Ads UI. Pulls from the views created
// by the migration plus the lead funnel.

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
};

export async function listCampaigns(): Promise<CampaignPerformanceRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_campaign_performance')
    .select('*')
    .order('last_date', { ascending: false, nullsFirst: false });
  return ((data as CampaignPerformanceRow[] | null) || []);
}

export async function listOverviewByDay(days = 30): Promise<DailyOverviewRow[]> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const { data } = await sb
    .from('ads_overview_daily')
    .select('*')
    .gte('metric_date', cutoff)
    .order('metric_date', { ascending: true });
  return ((data as DailyOverviewRow[] | null) || []);
}

export async function listLeadFunnel(opts: { stage?: 'new' | 'processed' | 'booked'; limit?: number } = {}): Promise<LeadFunnelRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_lead_funnel').select('*').limit(opts.limit ?? 200);
  if (opts.stage) q = q.eq('funnel_stage', opts.stage);
  const { data } = await q;
  return ((data as LeadFunnelRow[] | null) || []);
}

export async function getDashboardKpis(days = 30): Promise<{
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
  const cutoff = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const [{ data: rollup }, { data: leads }, { count: active }, { count: drafts }] = await Promise.all([
    sb.from('ads_overview_daily').select('spend, leads').gte('metric_date', cutoff),
    sb.from('ads_lead_funnel').select('matched_reservation_id, booking_value, booking_currency').gte('created_at', cutoff),
    sb.from('ads_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    sb.from('ads_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'DRAFT'),
  ]);
  type LeadRollupRow = { matched_reservation_id: string | null; booking_value: number | null; booking_currency: string | null };
  const rollupRows = (rollup as Array<{ spend: number; leads: number }> | null) || [];
  const spend = rollupRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const leadCount = rollupRows.reduce((s, r) => s + (Number(r.leads) || 0), 0);
  const leadRows = (leads as LeadRollupRow[] | null) || [];
  const bookings = leadRows.filter(l => l.matched_reservation_id).length;
  // Conversion value (simplistic: USD only for now — multi-currency conversion in Phase H follow-up)
  const attributedRevenue = leadRows
    .filter(l => l.matched_reservation_id && l.booking_currency === 'USD')
    .reduce((s, l) => s + (Number(l.booking_value) || 0), 0);
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
// Used by Performance tab. Only counts USD bookings until multi-currency conversion ships.
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
    sb.from('ads_campaign_performance').select('campaign_id, campaign_name, platform, spend, leads'),
    sb.from('ads_lead_funnel').select('campaign_id, matched_reservation_id, booking_value, booking_currency'),
  ]);
  type PerfRow = { campaign_id: number; campaign_name: string; platform: string; spend: number; leads: number };
  type FunnelRow = { campaign_id: number | null; matched_reservation_id: string | null; booking_value: number | null; booking_currency: string | null };
  const perfRows = (perf as PerfRow[] | null) || [];
  const funnelRows = (leads as FunnelRow[] | null) || [];

  // Roll up booked leads + revenue per campaign_id (USD only).
  const bookingsByCampaign: Record<number, { bookings: number; revenue: number }> = {};
  for (const l of funnelRows) {
    if (l.campaign_id == null) continue;
    if (!l.matched_reservation_id) continue;
    const entry = bookingsByCampaign[l.campaign_id] ||= { bookings: 0, revenue: 0 };
    entry.bookings += 1;
    if (l.booking_currency === 'USD') entry.revenue += Number(l.booking_value) || 0;
  }

  return perfRows.map(p => {
    const b = bookingsByCampaign[p.campaign_id] || { bookings: 0, revenue: 0 };
    const spend = Number(p.spend) || 0;
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
