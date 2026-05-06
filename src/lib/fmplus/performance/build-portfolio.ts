// src/lib/fmplus/performance/build-portfolio.ts
import { buildPortfolio, type PortfolioCard } from '@/lib/fmplus/budget/portfolio';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import type {
  PortfolioPerformancePayload,
  PortfolioContractRow,
  PeriodRange,
} from './types';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

const AMBER = 0.15;

export interface PortfolioArgs {
  period: PeriodRange;
  filters?: { service_line?: ServiceLine; q?: string };
}

export async function buildPortfolioPerformance(
  args: PortfolioArgs,
): Promise<PortfolioPerformancePayload> {
  const contracts: PortfolioCard[] = await buildPortfolio(args.filters ?? {});

  const rows: PortfolioContractRow[] = await Promise.all(
    contracts.map(async (c) => {
      const v = await buildBudgetVarianceV2({
        contractId: c.contract_id,
        yearIndex: c.current_year_index,
        scenario: 'initial',
      });
      const variance_pct =
        v.total_budget > 0 ? (v.total_actual - v.total_budget) / v.total_budget : 0;
      const absVar = Math.abs(variance_pct);
      const health: 'good' | 'warn' | 'bad' =
        absVar <= 0.05 ? 'good' : absVar <= AMBER ? 'warn' : 'bad';
      return {
        contract_id: c.contract_id,
        contract_name: c.project_name,
        customer: c.customer,
        current_year_index: c.current_year_index,
        revenue: c.current_year_revenue,
        expense: v.total_actual,
        gp: c.current_year_revenue - v.total_actual,
        gp_pct:
          c.current_year_revenue > 0
            ? (c.current_year_revenue - v.total_actual) / c.current_year_revenue
            : 0,
        variance_pct,
        health,
        last_actuals_sync: null,
        drill_url: `/fmplus/performance/${c.contract_id}?period=${args.period.chip}`,
      };
    }),
  );

  const ranked = [...rows].sort(
    (a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct),
  );

  const totals = {
    revenue: rows.reduce((a, r) => a + r.revenue, 0),
    expense: rows.reduce((a, r) => a + r.expense, 0),
    blended_gp_pct: 0,
    portfolio_variance_pct: rows.length
      ? rows.reduce((a, r) => a + r.variance_pct, 0) / rows.length
      : 0,
  };
  // blended_gp_pct = (revenue - expense) / revenue across all contracts
  if (totals.revenue > 0) {
    totals.blended_gp_pct = (totals.revenue - totals.expense) / totals.revenue;
  }

  const needs_attention = ranked.filter((r) => Math.abs(r.variance_pct) > AMBER);

  return { period: args.period, totals, contracts: ranked, needs_attention };
}
