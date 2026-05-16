import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';

export type DailySpendPoint = { date: string; spend_egp: number };

export type CampaignPacingRow = {
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  monthly_budget_cap_egp: number | null;
  spend_egp_mtd: number;
  projected_egp_eom: number;
  pct_of_cap: number;
  auto_paused: boolean;
};

export type RawCampaignSpend = {
  campaign_id: number;
  spend_egp_mtd: number;
  monthly_budget_cap_egp: number | null;
  auto_paused: boolean;
};

export type SpendPacingResult = {
  daily: DailySpendPoint[];
  campaigns: CampaignPacingRow[];
  total_spend_egp: number;
  total_cap_egp: number;
};

export function projectMonthlySpend(spendMtd: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return 0;
  return Math.round((spendMtd / dayOfMonth) * daysInMonth);
}

export function pctOfCap(spend: number, cap: number | null): number {
  if (cap == null || cap <= 0) return 0;
  return Math.round((spend / cap) * 100);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function getSpendPacing(opts: {
  range: { from: string; to: string };
}): Promise<SpendPacingResult> {
  const sb = supabaseAdmin();

  // Daily sparkline: sum by metric_date in the requested range, EGP-converted per currency.
  const { data: dailyRows, error: dailyErr } = await sb
    .from('ads_daily_metrics')
    .select('metric_date, spend_micros, account_id')
    .gte('metric_date', opts.range.from)
    .lte('metric_date', opts.range.to)
    .is('ad_id', null).is('ad_set_id', null);
  if (dailyErr) console.error('[pacing] daily query failed:', dailyErr);

  const { data: accounts } = await sb.from('ads_accounts').select('id, currency');
  const currencyByAccount = new Map<number, string>();
  for (const a of (accounts as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccount.set(a.id, a.currency);
  }

  type DailyRow = { metric_date: string; spend_micros: number | string; account_id: number };
  const drows = (dailyRows as DailyRow[] | null) ?? [];

  // Group spend per (date, currency), then convert each (date, currency) total to EGP.
  const perDateCurrency = new Map<string, Map<string, number>>();
  for (const r of drows) {
    const currency = currencyByAccount.get(r.account_id) ?? 'USD';
    const m = perDateCurrency.get(r.metric_date) ?? new Map<string, number>();
    m.set(currency, (m.get(currency) ?? 0) + (Number(r.spend_micros) || 0) / 1_000_000);
    perDateCurrency.set(r.metric_date, m);
  }
  const daily: DailySpendPoint[] = [];
  for (const [date, byCurrency] of Array.from(perDateCurrency.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const egpVals = await convertManyToEgp(
      Array.from(byCurrency.entries()).map(([currency, amount]) => ({ amount, currency }))
    );
    daily.push({ date, spend_egp: Math.round(egpVals.reduce((s, n) => s + n, 0)) });
  }

  // Per-campaign: MTD spend (current calendar month, Cairo-local) + cap + projection.
  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const cairoYear = Number(cairoToday.slice(0, 4));
  const cairoMonth = Number(cairoToday.slice(5, 7));
  const cairoDay = Number(cairoToday.slice(8, 10));
  const monthStart = `${cairoYear}-${String(cairoMonth).padStart(2, '0')}-01`;
  const totalDays = daysInMonth(cairoYear, cairoMonth);

  const { data: mtdRows } = await sb
    .from('ads_daily_metrics')
    .select('campaign_id, spend_micros, account_id')
    .gte('metric_date', monthStart)
    .lte('metric_date', cairoToday)
    .is('ad_id', null).is('ad_set_id', null);
  type MtdRow = { campaign_id: number; spend_micros: number | string; account_id: number };
  const mtd = (mtdRows as MtdRow[] | null) ?? [];

  const spendByCampaignByCurrency = new Map<number, Map<string, number>>();
  for (const m of mtd) {
    const currency = currencyByAccount.get(m.account_id) ?? 'USD';
    const cm = spendByCampaignByCurrency.get(m.campaign_id) ?? new Map<string, number>();
    cm.set(currency, (cm.get(currency) ?? 0) + (Number(m.spend_micros) || 0) / 1_000_000);
    spendByCampaignByCurrency.set(m.campaign_id, cm);
  }

  const { data: campaignRows } = await sb
    .from('ads_campaigns')
    .select('id, name, platform, monthly_budget_cap_usd, auto_paused_at')
    .neq('status', 'REMOVED');
  type CRow = { id: number; name: string; platform: 'meta'|'google'|'tiktok'; monthly_budget_cap_usd: number | null; auto_paused_at: string | null };
  const crows = (campaignRows as CRow[] | null) ?? [];

  // EGP-convert each campaign's spend.
  const campaigns: CampaignPacingRow[] = [];
  for (const c of crows) {
    const byCurrency = spendByCampaignByCurrency.get(c.id) ?? new Map<string, number>();
    const egpVals = await convertManyToEgp(
      Array.from(byCurrency.entries()).map(([currency, amount]) => ({ amount, currency }))
    );
    const spendEgpMtd = Math.round(egpVals.reduce((s, n) => s + n, 0));
    // Cap is in USD. Convert to EGP for the row using a single-currency conversion.
    let capEgp: number | null = null;
    if (c.monthly_budget_cap_usd != null) {
      const conv = await convertManyToEgp([{ amount: c.monthly_budget_cap_usd, currency: 'USD' }]);
      capEgp = Math.round(conv[0] || 0);
    }
    const projected = projectMonthlySpend(spendEgpMtd, cairoDay, totalDays);
    campaigns.push({
      campaign_id: c.id,
      campaign_name: c.name,
      platform: c.platform,
      monthly_budget_cap_egp: capEgp,
      spend_egp_mtd: spendEgpMtd,
      projected_egp_eom: projected,
      pct_of_cap: pctOfCap(spendEgpMtd, capEgp),
      auto_paused: c.auto_paused_at != null,
    });
  }
  campaigns.sort((a, b) => b.pct_of_cap - a.pct_of_cap);

  const total_spend_egp = campaigns.reduce((s, c) => s + c.spend_egp_mtd, 0);
  const total_cap_egp = campaigns.reduce((s, c) => s + (c.monthly_budget_cap_egp ?? 0), 0);

  return { daily, campaigns, total_spend_egp, total_cap_egp };
}
