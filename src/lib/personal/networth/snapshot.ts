import { supabaseAdmin } from '@/lib/supabase';
import { ratesAsOf } from './fx';

export type SnapshotKind = 'monthly_auto' | 'manual';

export async function takeSnapshot(appUserId: string, kind: SnapshotKind): Promise<{
  snapshotId: string;
  netWorthEgp: number;
}> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const fx = await ratesAsOf(today);

  // Pull assets, liabilities, and stocks-pipe value
  const [assetsRes, liabilitiesRes, currentRes] = await Promise.all([
    sb.from('personal_networth_assets')
      .select('id, name, currency, balance')
      .eq('app_user_id', appUserId).eq('active', true),
    sb.from('personal_networth_liabilities')
      .select('id, name, currency, current_balance')
      .eq('app_user_id', appUserId).eq('active', true),
    sb.from('v_personal_networth_current')
      .select('stocks_pipe_egp')
      .eq('app_user_id', appUserId).maybeSingle(),
  ]);

  if (assetsRes.error) throw assetsRes.error;
  if (liabilitiesRes.error) throw liabilitiesRes.error;

  const stocksEgp = Number(currentRes.data?.stocks_pipe_egp ?? 0);

  const lines: Array<{
    line_type: 'asset' | 'liability' | 'stocks_pipe';
    entity_id: string | null;
    display_name: string;
    currency: string;
    amount: number;
    amount_egp: number;
  }> = [];

  for (const a of assetsRes.data ?? []) {
    const rate = fx[a.currency] ?? 1;
    lines.push({
      line_type: 'asset', entity_id: a.id, display_name: a.name,
      currency: a.currency, amount: Number(a.balance),
      amount_egp: Math.round(Number(a.balance) * rate * 100) / 100,
    });
  }
  for (const l of liabilitiesRes.data ?? []) {
    const rate = fx[l.currency] ?? 1;
    lines.push({
      line_type: 'liability', entity_id: l.id, display_name: l.name,
      currency: l.currency, amount: Number(l.current_balance),
      amount_egp: Math.round(Number(l.current_balance) * rate * 100) / 100,
    });
  }
  if (stocksEgp !== 0) {
    lines.push({
      line_type: 'stocks_pipe', entity_id: null,
      display_name: 'AOLB Stocks', currency: 'EGP',
      amount: stocksEgp, amount_egp: stocksEgp,
    });
  }

  const totalAssetsEgp = lines
    .filter(l => l.line_type !== 'liability')
    .reduce((s, l) => s + l.amount_egp, 0);
  const totalLiabilitiesEgp = lines
    .filter(l => l.line_type === 'liability')
    .reduce((s, l) => s + l.amount_egp, 0);
  const netWorthEgp = Math.round((totalAssetsEgp - totalLiabilitiesEgp) * 100) / 100;

  const { data: snap, error: snapErr } = await sb
    .from('personal_networth_snapshots')
    .insert({
      app_user_id: appUserId, kind,
      total_assets_egp: totalAssetsEgp,
      total_liabilities_egp: totalLiabilitiesEgp,
      net_worth_egp: netWorthEgp,
      fx_rates_used: fx,
    })
    .select('id').single();
  if (snapErr || !snap) throw snapErr ?? new Error('snapshot insert failed');

  if (lines.length > 0) {
    const linesInsert = lines.map(l => ({ ...l, snapshot_id: snap.id }));
    const { error: linesErr } = await sb
      .from('personal_networth_snapshot_lines').insert(linesInsert);
    if (linesErr) throw linesErr;
  }

  return { snapshotId: snap.id, netWorthEgp };
}

export async function listSnapshotsForChart(
  appUserId: string, months: number,
): Promise<Array<{ takenAt: string; netWorthEgp: number }>> {
  const sb = supabaseAdmin();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data, error } = await sb
    .from('personal_networth_snapshots')
    .select('taken_at, net_worth_egp')
    .eq('app_user_id', appUserId)
    .gte('taken_at', cutoff.toISOString())
    .order('taken_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({
    takenAt: r.taken_at, netWorthEgp: Number(r.net_worth_egp),
  }));
}
