import { supabaseAdmin } from '@/lib/supabase';

export type OverviewKpis = {
  totalAssetsEgp: number;
  totalLiabilitiesEgp: number;
  netWorthEgp: number;
  stocksPipeEgp: number;
  deltaSinceLastSnapshotEgp: number;
  deltaPct: number | null;
};

export async function getOverviewKpis(appUserId: string): Promise<OverviewKpis> {
  const sb = supabaseAdmin();
  const [current, latestSnap] = await Promise.all([
    sb.from('v_personal_networth_current')
      .select('*').eq('app_user_id', appUserId).maybeSingle(),
    sb.from('personal_networth_snapshots')
      .select('net_worth_egp').eq('app_user_id', appUserId)
      .order('taken_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (current.error) throw new Error(`getOverviewKpis: current view read failed: ${current.error.message}`);
  if (latestSnap.error) throw new Error(`getOverviewKpis: latest snapshot read failed: ${latestSnap.error.message}`);
  const totalAssetsEgp = Number(current.data?.total_assets_egp ?? 0);
  const totalLiabilitiesEgp = Number(current.data?.total_liabilities_egp ?? 0);
  const netWorthEgp = Number(current.data?.net_worth_egp ?? 0);
  const stocksPipeEgp = Number(current.data?.stocks_pipe_egp ?? 0);
  const lastNet = latestSnap.data ? Number(latestSnap.data.net_worth_egp) : null;
  const delta = lastNet === null ? 0 : netWorthEgp - lastNet;
  const deltaPct = lastNet && lastNet !== 0 ? (delta / lastNet) * 100 : null;
  return {
    totalAssetsEgp, totalLiabilitiesEgp, netWorthEgp, stocksPipeEgp,
    deltaSinceLastSnapshotEgp: Math.round(delta * 100) / 100,
    deltaPct: deltaPct === null ? null : Math.round(deltaPct * 100) / 100,
  };
}

export type UpcomingPayment = {
  source: 'schedule' | 'recurring';
  refId: string;
  dueDate: string;
  displayName: string;
  category: string;
  amount: number;
  currency: string;
};

export async function getUpcomingPayments(
  appUserId: string, daysAhead = 30,
): Promise<UpcomingPayment[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('v_personal_networth_upcoming')
    .select('*').eq('app_user_id', appUserId);
  if (error) throw new Error(`getUpcomingPayments: view read failed: ${error.message}`);
  return (data ?? []).map(r => ({
    source: r.source, refId: r.ref_id, dueDate: r.due_date,
    displayName: r.display_name, category: r.category,
    amount: Number(r.amount), currency: r.currency,
  }));
}

export type CharityYtd = {
  totalEgp: number;
  monthlyAvg: number;
  yearlyGoalEgp: number | null;
  progressPct: number | null;
};

export async function getCharityYtd(appUserId: string): Promise<CharityYtd> {
  const sb = supabaseAdmin();
  // Year + month boundaries anchored to Cairo TZ — server runs UTC, so plain
  // new Date().getFullYear() shifts ~2 hours into Jan 1 Cairo (DST-dependent).
  const cairoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const cairoYear = cairoParts.find(p => p.type === 'year')!.value;
  const cairoMonth = Number(cairoParts.find(p => p.type === 'month')!.value);
  const yearStart = `${cairoYear}-01-01`;
  const [paymentsRes, settingsRes] = await Promise.all([
    sb.from('personal_networth_payments')
      .select('amount, currency, occurred_on')
      .eq('app_user_id', appUserId).eq('category', 'charity')
      .gte('occurred_on', yearStart),
    sb.from('personal_networth_settings')
      .select('charity_goal_egp_year')
      .eq('app_user_id', appUserId).maybeSingle(),
  ]);
  if (paymentsRes.error) throw new Error(`getCharityYtd: payments read failed: ${paymentsRes.error.message}`);
  if (settingsRes.error) throw new Error(`getCharityYtd: settings read failed: ${settingsRes.error.message}`);
  // Convert each payment to EGP at its occurred_on rate via fx_lookup SQL function
  let totalEgp = 0;
  for (const p of paymentsRes.data ?? []) {
    const { data: rate, error: rateErr } = await sb.rpc('fx_lookup', {
      p_currency: p.currency, p_as_of: p.occurred_on,
    });
    if (rateErr) throw new Error(`getCharityYtd: fx_lookup failed for ${p.currency}@${p.occurred_on}: ${rateErr.message}`);
    totalEgp += Number(p.amount) * (rate ?? 1);
  }
  totalEgp = Math.round(totalEgp * 100) / 100;
  const monthlyAvg = Math.round((totalEgp / cairoMonth) * 100) / 100;
  const goal = settingsRes.data?.charity_goal_egp_year ? Number(settingsRes.data.charity_goal_egp_year) : null;
  const progressPct = goal && goal > 0 ? Math.round((totalEgp / goal) * 10000) / 100 : null;
  return { totalEgp, monthlyAvg, yearlyGoalEgp: goal, progressPct };
}
