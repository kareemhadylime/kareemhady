import { supabaseAdmin } from '@/lib/supabase';

// Today as YYYY-MM-DD anchored to Africa/Cairo. The Vercel server runs in UTC,
// so a plain `new Date().toISOString().slice(0,10)` returns the prior day for
// roughly the first 2-3 hours of Cairo wall-clock time, which would call
// fx_lookup with yesterday's rate.
function cairoTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

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
  // Year + month boundaries anchored to Cairo TZ (see cairoTodayIso comment).
  const today = cairoTodayIso();
  const cairoYear = today.slice(0, 4);
  const cairoMonth = Number(today.slice(5, 7));
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

export type MixSlice = {
  label: string;
  amountEgp: number;
  pct: number;
};

export async function getAssetMix(appUserId: string): Promise<MixSlice[]> {
  const sb = supabaseAdmin();
  const today = cairoTodayIso();
  const [assetsRes, stocksRes] = await Promise.all([
    sb.from('personal_networth_assets')
      .select('kind, currency, balance').eq('app_user_id', appUserId).eq('active', true),
    sb.from('v_personal_networth_current')
      .select('stocks_pipe_egp').eq('app_user_id', appUserId).maybeSingle(),
  ]);
  if (assetsRes.error) throw new Error(`getAssetMix: assets read failed: ${assetsRes.error.message}`);
  if (stocksRes.error) throw new Error(`getAssetMix: stocks pipe read failed: ${stocksRes.error.message}`);
  const bucket: Record<string, number> = {};
  for (const a of assetsRes.data ?? []) {
    const { data: rate, error: rateErr } = await sb.rpc('fx_lookup', { p_currency: a.currency, p_as_of: today });
    if (rateErr) throw new Error(`getAssetMix: fx_lookup failed for ${a.currency}@${today}: ${rateErr.message}`);
    bucket[a.kind] = (bucket[a.kind] ?? 0) + Number(a.balance) * Number(rate ?? 1);
  }
  const stocksEgp = Number(stocksRes.data?.stocks_pipe_egp ?? 0);
  if (stocksEgp > 0) bucket['stocks_pipe'] = stocksEgp;
  const total = Object.values(bucket).reduce((s, v) => s + v, 0);
  return Object.entries(bucket).map(([label, amount]) => ({
    label, amountEgp: Math.round(amount * 100) / 100,
    pct: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
  }));
}

export async function getLiabilityMix(appUserId: string): Promise<MixSlice[]> {
  const sb = supabaseAdmin();
  const today = cairoTodayIso();
  const { data, error } = await sb.from('personal_networth_liabilities')
    .select('kind, currency, current_balance').eq('app_user_id', appUserId).eq('active', true);
  if (error) throw new Error(`getLiabilityMix: liabilities read failed: ${error.message}`);
  const bucket: Record<string, number> = {};
  for (const l of data ?? []) {
    const { data: rate, error: rateErr } = await sb.rpc('fx_lookup', { p_currency: l.currency, p_as_of: today });
    if (rateErr) throw new Error(`getLiabilityMix: fx_lookup failed for ${l.currency}@${today}: ${rateErr.message}`);
    bucket[l.kind] = (bucket[l.kind] ?? 0) + Number(l.current_balance) * Number(rate ?? 1);
  }
  const total = Object.values(bucket).reduce((s, v) => s + v, 0);
  return Object.entries(bucket).map(([label, amount]) => ({
    label, amountEgp: Math.round(amount * 100) / 100,
    pct: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
  }));
}

export type MonthlyReport = {
  monthLabel: string;
  totalEgp: number;
  prevMonthTotalEgp: number;
  deltaEgp: number;
  deltaPct: number | null;
  byCategory: Array<{ category: string; amountEgp: number; count: number; deltaVsPrevEgp: number }>;
  paymentCount: number;
};

export async function getMonthlyReport(
  appUserId: string, year: number, month: number,
): Promise<MonthlyReport> {
  const sb = supabaseAdmin();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const prevMonth = month === 1
    ? `${year - 1}-12-01`
    : `${year}-${String(month - 1).padStart(2, '0')}-01`;
  const [thisRes, prevRes] = await Promise.all([
    sb.from('personal_networth_payments')
      .select('category, amount, currency, occurred_on')
      .eq('app_user_id', appUserId).gte('occurred_on', monthStart).lt('occurred_on', nextMonth),
    sb.from('personal_networth_payments')
      .select('category, amount, currency, occurred_on')
      .eq('app_user_id', appUserId).gte('occurred_on', prevMonth).lt('occurred_on', monthStart),
  ]);
  if (thisRes.error) throw new Error(`getMonthlyReport: this-month payments read failed: ${thisRes.error.message}`);
  if (prevRes.error) throw new Error(`getMonthlyReport: prev-month payments read failed: ${prevRes.error.message}`);

  async function toEgp(amount: number, currency: string, asOf: string): Promise<number> {
    const { data: rate, error: rateErr } = await sb.rpc('fx_lookup', { p_currency: currency, p_as_of: asOf });
    if (rateErr) throw new Error(`getMonthlyReport: fx_lookup failed for ${currency}@${asOf}: ${rateErr.message}`);
    return amount * Number(rate ?? 1);
  }

  const thisByCat: Record<string, { amount: number; count: number }> = {};
  let thisTotal = 0;
  for (const p of thisRes.data ?? []) {
    const egp = await toEgp(Number(p.amount), p.currency, p.occurred_on);
    thisTotal += egp;
    thisByCat[p.category] = {
      amount: (thisByCat[p.category]?.amount ?? 0) + egp,
      count: (thisByCat[p.category]?.count ?? 0) + 1,
    };
  }
  const prevByCat: Record<string, number> = {};
  let prevTotal = 0;
  for (const p of prevRes.data ?? []) {
    const egp = await toEgp(Number(p.amount), p.currency, p.occurred_on);
    prevTotal += egp;
    prevByCat[p.category] = (prevByCat[p.category] ?? 0) + egp;
  }

  return {
    monthLabel: `${year}-${String(month).padStart(2, '0')}`,
    totalEgp: Math.round(thisTotal * 100) / 100,
    prevMonthTotalEgp: Math.round(prevTotal * 100) / 100,
    deltaEgp: Math.round((thisTotal - prevTotal) * 100) / 100,
    deltaPct: prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 10000) / 100 : null,
    byCategory: Object.entries(thisByCat).map(([category, v]) => ({
      category, amountEgp: Math.round(v.amount * 100) / 100, count: v.count,
      deltaVsPrevEgp: Math.round((v.amount - (prevByCat[category] ?? 0)) * 100) / 100,
    })),
    paymentCount: thisRes.data?.length ?? 0,
  };
}
