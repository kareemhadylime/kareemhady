import { supabaseAdmin } from '@/lib/supabase';
import { buildBudgetVariance } from './variance';
import type { ServiceLine } from './types';
import type { Scenario } from './schema';

export type PortfolioRow = {
  project_id: number;
  project_name: string;
  plan_label: string | null;
  service_lines: ServiceLine[];
  budget_ytd: number;
  actual_ytd: number;
  variance: number;
  variance_pct: number | null;
  status: 'draft' | 'published';
  health_color: 'green' | 'amber' | 'red';
};

export async function buildPortfolio(opts: {
  fiscalYear: number;
  scenario: Scenario;
  ytdThrough?: number;
  serviceLineFilter?: ServiceLine | null;
}): Promise<{ rows: PortfolioRow[]; totals: { budget: number; actual: number; variance: number; variance_pct: number | null }; missing: Array<{ project_id: number; project_name: string }> }> {
  const sb = supabaseAdmin();
  const { data: budgets } = await sb
    .from('project_budgets')
    .select('id, project_id, status, fiscal_year, scenario')
    .eq('fiscal_year', opts.fiscalYear)
    .eq('scenario', opts.scenario);
  const list = (budgets ?? []) as Array<{ id: number; project_id: number; status: 'draft'|'published' }>;
  const rows: PortfolioRow[] = [];
  let totalBudget = 0, totalActual = 0;
  for (const b of list) {
    const v = await buildBudgetVariance({
      projectId: b.project_id, fiscalYear: opts.fiscalYear,
      scenario: opts.scenario, ytdThrough: opts.ytdThrough,
    });
    if (!v) continue;
    if (opts.serviceLineFilter && !v.segments.some(s => s.service_line === opts.serviceLineFilter)) continue;
    const { data: aa } = await sb
      .from('odoo_analytic_accounts').select('plan_id').eq('id', v.project_id).maybeSingle();
    const planId = (aa as { plan_id: number | null } | null)?.plan_id;
    let planLabel: string | null = null;
    if (planId) {
      const { data: pl } = await sb.from('odoo_analytic_plans').select('name').eq('id', planId).maybeSingle();
      planLabel = (pl as { name: string } | null)?.name ?? null;
    }
    totalBudget += v.ytd.budget;
    totalActual += v.ytd.actual;
    rows.push({
      project_id: v.project_id, project_name: v.project_name,
      plan_label: planLabel,
      service_lines: v.segments.map(s => s.service_line),
      budget_ytd: v.ytd.budget, actual_ytd: v.ytd.actual,
      variance: v.ytd.variance, variance_pct: v.ytd.variance_pct,
      status: v.status, health_color: v.ytd.color,
    });
  }
  rows.sort((a, b) => Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0));
  const totals = {
    budget: totalBudget, actual: totalActual,
    variance: totalActual - totalBudget,
    variance_pct: totalBudget === 0 ? null : ((totalActual - totalBudget) / totalBudget) * 100,
  };

  // "Action needed" — HK Projects plan accounts without a budget for this FY.
  const { data: hkProjects } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, root_plan_id, odoo_analytic_plans!inner(name)')
    .eq('active', true);
  type AA = { id: number; name: string; odoo_analytic_plans: { name: string } };
  const allHk = ((hkProjects ?? []) as unknown as AA[]).filter(a => /HK Projects/i.test(a.odoo_analytic_plans.name));
  const budgetedIds = new Set(rows.map(r => r.project_id));
  const missing = allHk
    .filter(a => !budgetedIds.has(a.id))
    .map(a => ({ project_id: a.id, project_name: a.name }));

  return { rows, totals, missing };
}
