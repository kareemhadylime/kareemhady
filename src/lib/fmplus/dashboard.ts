import { supabaseAdmin } from '../supabase';
import { buildFmplusPnl } from './financials';
import { resolvePeriodSeries } from './period-series';
import type {
  Granularity, Period, Scope, DashboardReport, DashboardKpi, ServiceKey,
  PeriodValues, PnlReport,
} from './types';
import { classifyByPrefix } from './classifier';

const SERVICE_LABEL: Record<ServiceKey, string> = {
  hk: 'Housekeeping',
  mep: 'MEP',
  security: 'Security',
  landscape: 'Landscape',
  pest: 'Pest Control',
  waste: 'Waste Management',
  paid: 'Paid Services',
  vo: 'Variation Order',
};

function pctChange(curr: number, prior: number): number {
  if (!prior || prior === 0) return 0;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

function sparklineFrom(values: PeriodValues, periods: Period[]): number[] {
  // Last 6 periods of same granularity, oldest -> newest for chart axis.
  return periods.slice(0, 6).map(p => values[p.key] || 0).reverse();
}

function kpiFor(
  current: Period,
  prior: Period,
  totals: PeriodValues,
  periods: Period[],
): DashboardKpi {
  return {
    current: totals[current.key] || 0,
    prior: totals[prior.key] || 0,
    deltaPct: pctChange(totals[current.key] || 0, totals[prior.key] || 0),
    sparkline: sparklineFrom(totals, periods),
  };
}

export async function buildFmplusDashboard(args: {
  granularity: Granularity;
  asof: string;
  scope: Scope;
}): Promise<DashboardReport> {
  // Trend window: current + 11 prior periods. One round-trip covers KPIs +
  // sparklines + trend chart from a single P&L call.
  const periods = resolvePeriodSeries(args.granularity, 12, args.asof);
  const pnl: PnlReport = await buildFmplusPnl({ periods, scope: args.scope });

  const current = periods[0];
  const prior = periods[1] || periods[0];

  // KPIs: revenue, gross profit, ebitda, net profit
  const kpis: DashboardReport['kpis'] = {
    revenue:     kpiFor(current, prior, pnl.sections.revenue.totals, periods),
    grossProfit: kpiFor(current, prior, pnl.subtotals.gross_profit,  periods),
    ebitda:      kpiFor(current, prior, pnl.subtotals.ebitda,        periods),
    netProfit:   kpiFor(current, prior, pnl.subtotals.net_profit,    periods),
  };

  // Revenue mix: per-service revenue from revenue.subgroups[service_revenue]
  const totalRev = pnl.sections.revenue.totals[current.key] || 0;
  const revenueMix: DashboardReport['revenueMix'] = [];
  const svcRev = pnl.sections.revenue.subgroups.find(g => g.key === 'service_revenue');
  if (svcRev) {
    // Aggregate revenue by service via classifier
    const byService = new Map<string, { service: ServiceKey | 'other'; label: string; value: number }>();
    for (const leaf of svcRev.leaves) {
      const cls = classifyByPrefix(leaf.code, leaf.name, leaf.account_type);
      const svc: ServiceKey | 'other' = cls?.service || 'other';
      const label = svc === 'other' ? 'Other' : SERVICE_LABEL[svc];
      const v = leaf.values[current.key] || 0;
      const existing = byService.get(svc);
      if (existing) existing.value += v;
      else byService.set(svc, { service: svc, label, value: v });
    }
    for (const e of byService.values()) {
      revenueMix.push({ ...e, pct: totalRev ? (e.value / totalRev) * 100 : 0 });
    }
    revenueMix.sort((a, b) => b.value - a.value);
  }
  // Other Revenues bucket
  const otherRev = pnl.sections.revenue.subgroups.find(g => g.key === 'other_revenue');
  if (otherRev) {
    const v = otherRev.totals[current.key] || 0;
    if (Math.abs(v) > 0.005) {
      revenueMix.push({
        service: 'other',
        label: 'Other Revenues',
        value: v,
        pct: totalRev ? (v / totalRev) * 100 : 0,
      });
    }
  }

  // Cost mix: per-service cost from cost_of_revenue.serviceLines
  const totalCost = pnl.sections.cost_of_revenue.totals[current.key] || 0;
  const costMix: DashboardReport['costMix'] = (pnl.sections.cost_of_revenue.serviceLines || [])
    .map(svc => ({
      service: svc.service,
      label: SERVICE_LABEL[svc.service],
      value: svc.totals[current.key] || 0,
      pct: totalCost ? ((svc.totals[current.key] || 0) / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Gross margin by service (sorted desc — most actionable first)
  const marginByService: DashboardReport['marginByService'] = (pnl.sections.cost_of_revenue.serviceLines || [])
    .map(svc => ({
      service: svc.service,
      label: SERVICE_LABEL[svc.service],
      pct: svc.grossMarginPct[current.key] || 0,
      revenue: 0, // optional fill — not strictly needed by chart
      cost:    svc.totals[current.key] || 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  // 12-period trend, oldest -> newest for chart axis
  const trend: DashboardReport['trend'] = periods
    .map(p => ({
      period: p,
      revenue:     pnl.sections.revenue.totals[p.key] || 0,
      grossProfit: pnl.subtotals.gross_profit[p.key]  || 0,
      ebitda:      pnl.subtotals.ebitda[p.key]        || 0,
      netProfit:   pnl.subtotals.net_profit[p.key]    || 0,
    }))
    .reverse();

  // Top-10 active projects: aggregate odoo_move_line_analytics for the current period.
  // Direct join query — bounded by limit and scope.
  const sb = supabaseAdmin();
  const topProjects: DashboardReport['topProjects'] = [];
  try {
    const { data: rows, error } = await sb
      .from('odoo_move_line_analytics')
      .select('analytic_account_id, odoo_analytic_accounts!inner(name, plan_id), odoo_move_lines!inner(balance, company_id, date, parent_state)')
      .in('odoo_move_lines.company_id', args.scope.companyIds)
      .eq('odoo_move_lines.parent_state', 'posted')
      .gte('odoo_move_lines.date', current.fromDate)
      .lte('odoo_move_lines.date', current.toDate)
      .limit(5000);
    if (!error && Array.isArray(rows)) {
      const agg = new Map<number, { name: string; abs: number }>();
      for (const row of rows as unknown as Array<{
        analytic_account_id: number;
        odoo_analytic_accounts: { name: string; plan_id: number | null };
        odoo_move_lines: { balance: number };
      }>) {
        const e = agg.get(row.analytic_account_id) || {
          name: row.odoo_analytic_accounts.name,
          abs: 0,
        };
        e.abs += Math.abs(Number(row.odoo_move_lines.balance) || 0);
        agg.set(row.analytic_account_id, e);
      }
      const top = Array.from(agg.entries())
        .map(([accountId, v]) => ({ accountId, name: v.name, planName: '', absBalance: v.abs }))
        .sort((a, b) => b.absBalance - a.absBalance)
        .slice(0, 10);
      topProjects.push(...top);
    }
  } catch {
    // Defensive: top-projects is informational; failure shouldn't break the
    // entire dashboard. Caller will see an empty array and can handle UI fallback.
  }

  return {
    periods,
    scope: args.scope,
    kpis,
    revenueMix,
    costMix,
    marginByService,
    trend,
    topProjects,
  };
}
