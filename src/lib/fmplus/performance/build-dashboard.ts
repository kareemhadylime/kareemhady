// src/lib/fmplus/performance/build-dashboard.ts
import { supabaseAdmin } from '@/lib/supabase';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import { resolvePriorPeriod } from './period';
import { weightedAvgCtc, impliedHeadcount } from './derive-implied-hc';
import { linearForecast } from './derive-forecast';
import { computeMobAmortization } from './derive-mobilization';
import { computeOvertimeBlock } from './derive-overtime';
import { topVendors } from './derive-vendors';
import { deriveAnomalies } from './derive-anomalies';
import type {
  ContractDashboardPayload,
  KpiTile,
  ServiceLineRow,
  ManningRow,
  CategoryRow,
  UnmappedLine,
  YoyRow,
  MobilizationRow,
  PeriodRange,
} from './types';
import type { Category, ServiceLine } from '@/lib/fmplus/budget/types';

const CATEGORY_LABELS: Record<Category, string> = {
  manning: 'Manning',
  ppe: 'PPE',
  tools: 'Tools',
  consumables: 'Consumables',
  transport: 'Transport',
  it: 'IT',
  governmental: 'Governmental',
  other: 'Other',
};

const SERVICE_LABELS: Record<ServiceLine, string> = {
  hk: 'Housekeeping',
  mep: 'MEP',
  landscape: 'Landscape',
  security: 'Security',
  pest_ctrl: 'Pest Control',
  waste_mgmt: 'Waste Management',
  back_office: 'Back Office',
};

interface BuildArgs {
  contract_id: number;
  period: PeriodRange;
  compare?: boolean;
}

export async function buildContractDashboard(args: BuildArgs): Promise<ContractDashboardPayload> {
  const sb = supabaseAdmin();

  // 1. Contract
  const { data: contract, error: ce } = await sb
    .from('project_contracts')
    .select('id,name,customer,project_id,contract_value,start_date,end_date')
    .eq('id', args.contract_id)
    .single();
  if (ce || !contract) throw new Error(`contract ${args.contract_id} not found`);

  const contractRow = contract as {
    id: number;
    name: string;
    customer: string | null;
    project_id: number;
    contract_value: number;
    start_date: string;
    end_date: string | null;
  };

  // 2. Current year (highest year_index)
  const { data: years } = await sb
    .from('project_years')
    .select('id,year_index,fiscal_year,scenario,status,published_at')
    .eq('contract_id', args.contract_id)
    .order('year_index', { ascending: false })
    .limit(1);

  const currentYear = ((years ?? []) as Array<{
    id: number;
    year_index: number;
    fiscal_year: number | null;
    scenario: 'initial' | 'revised' | 'reforecast';
    status: 'draft' | 'published';
    published_at: string | null;
  }>)[0];

  if (!currentYear) throw new Error(`no years for contract ${args.contract_id}`);

  // 3. Variance backbone
  const variance = await buildBudgetVarianceV2({
    contractId: args.contract_id,
    yearIndex: currentYear.year_index,
    scenario: currentYear.scenario,
  });

  // 4. Service-line rollup rows
  const service_lines: ServiceLineRow[] = (variance.segments ?? []).map(s => {
    const variance_abs = s.segment_actual - s.segment_budget;
    const variance_pct = s.segment_budget > 0 ? variance_abs / s.segment_budget : 0;
    return {
      service_line: s.service_line,
      service_label: SERVICE_LABELS[s.service_line] ?? String(s.service_line),
      budget: s.segment_budget,
      actual: s.segment_actual,
      variance_abs,
      variance_pct,
      gp_pct: 0, // v1 stub — refined when revenue rollup wired
      status: classifyVariance(variance_pct),
      drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&service=${s.service_line}&from=${args.period.from}&to=${args.period.to}`,
    };
  });

  // 5. Manning panel
  const manning: ManningRow[] = await Promise.all(
    (variance.segments ?? []).map(async seg => {
      const { data: manningRows } = await sb
        .from('budget_lines')
        .select('qty,unit_cost')
        .eq('year_id', currentYear.id)
        .eq('service_line', seg.service_line)
        .eq('category', 'manning');
      const rows = ((manningRows ?? []) as Array<{ qty: number; unit_cost: number }>);
      const avgCtc = weightedAvgCtc(rows);
      const manningCat = seg.categories.find(c => c.category === 'manning');
      const spend_actual = manningCat?.ytd_actual ?? 0;
      const spend_budget = manningCat?.ytd_budget ?? 0;
      const hc_implied_raw = impliedHeadcount(spend_actual, avgCtc);
      const hc_required = rows.reduce((a, r) => a + Math.round(r.qty * 0.85), 0);
      const hc_budgeted = rows.reduce((a, r) => a + r.qty, 0);
      return {
        service_line: seg.service_line,
        service_label: SERVICE_LABELS[seg.service_line] ?? String(seg.service_line),
        hc_required,
        hc_budgeted,
        hc_implied: hc_implied_raw ?? 0,
        spend_budget,
        spend_actual,
        spend_variance_pct: spend_budget > 0 ? (spend_actual - spend_budget) / spend_budget : 0,
        drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&service=${seg.service_line}&category=manning&from=${args.period.from}&to=${args.period.to}`,
      };
    }),
  );

  // 6. Category rollup (across all service lines)
  const catTotals: Record<Category, { budget: number; actual: number }> = Object.fromEntries(
    Object.keys(CATEGORY_LABELS).map(c => [c, { budget: 0, actual: 0 }]),
  ) as Record<Category, { budget: number; actual: number }>;
  for (const seg of variance.segments ?? []) {
    for (const c of seg.categories) {
      const t = catTotals[c.category];
      if (!t) continue;
      t.budget += c.ytd_budget;
      t.actual += c.ytd_actual;
    }
  }
  const categories: CategoryRow[] = (Object.keys(catTotals) as Category[]).map(cat => {
    const t = catTotals[cat];
    const variance_abs = t.actual - t.budget;
    const variance_pct = t.budget > 0 ? variance_abs / t.budget : 0;
    return {
      category: cat,
      category_label: CATEGORY_LABELS[cat],
      budget: t.budget,
      actual: t.actual,
      variance_abs,
      variance_pct,
      drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&category=${cat}&from=${args.period.from}&to=${args.period.to}`,
    };
  });

  // 7. Unmapped actuals
  // variance v2 currently rolls up unmapped_actuals as a single number, not a per-line array.
  // Until a per-line surface is added (future task), expose an empty list — the panel auto-hides.
  const unmapped: UnmappedLine[] = [];

  // 8. KPIs
  const total_budget = variance.total_budget;
  const total_actual = variance.total_actual;
  const variance_pct = total_budget > 0 ? (total_actual - total_budget) / total_budget : 0;
  const revenue = service_lines.reduce((a, s) => a + s.budget * (1 + s.gp_pct), 0);
  const gp_abs = revenue - total_actual;
  const gp_pct = revenue > 0 ? gp_abs / revenue : 0;

  const kpis: KpiTile[] = [
    { id: 'revenue',      label: 'Revenue',     value: revenue,      unit: 'EGP-M', variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
    { id: 'expense',      label: 'Expense',     value: total_actual, unit: 'EGP-M', variance_pct, variance_abs: total_actual - total_budget, status: classifyVariance(variance_pct), spark: [] },
    { id: 'gp',           label: 'GP',          value: gp_abs,       unit: 'EGP-M', variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
    { id: 'gp_pct',       label: 'GP %',        value: gp_pct,       unit: '%',     variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
    { id: 'variance_pct', label: 'Variance %',  value: variance_pct, unit: '%',     variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
  ];

  // 9. Forecast
  const monthsElapsed = elapsedMonths(currentYear, args.period.to);
  const forecast = linearForecast({
    period_actual: total_actual,
    months_elapsed: monthsElapsed,
    months_total: 12,
    budget_year: total_budget,
    amber_pct: 0.05,
    red_pct: 0.15,
  });

  // 10. Top vendors
  const vendors = await topVendors({
    contract_id: args.contract_id,
    project_id: contractRow.project_id,
    from: args.period.from,
    to: args.period.to,
    period_total: total_actual,
  });

  // 11. Overtime
  const otBudget = await sumManningOtBudget(sb, currentYear.id);
  const otActual = 0; // v1 stub — pattern-match against OT account codes is a follow-up task
  const totalManningBudget = manning.reduce((a, m) => a + m.spend_budget, 0);
  const totalManningActual = manning.reduce((a, m) => a + m.spend_actual, 0);
  const overtime = computeOvertimeBlock({
    ot_actual: otActual,
    manning_actual: totalManningActual,
    ot_budget: otBudget,
    manning_budget: totalManningBudget,
    spark: [],
    drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&category=manning&ot=1&from=${args.period.from}&to=${args.period.to}`,
    amber_pct: 0.05,
  });

  // 12. Mobilization amortization
  const { data: mobLines } = await sb
    .from('mobilization_lines')
    .select('id,label_en,qty,unit_cost,amortization,amortization_months')
    .eq('contract_id', args.contract_id);
  const mobilization: MobilizationRow[] = ((mobLines ?? []) as Array<{
    id: number;
    label_en: string;
    qty: number;
    unit_cost: number;
    amortization: 'straight_line' | 'flat';
    amortization_months: number;
  }>).map(m =>
    computeMobAmortization(
      {
        mob_line_id: m.id,
        label: m.label_en,
        total_cost: m.qty * m.unit_cost,
        amortization: m.amortization,
        amortization_months: m.amortization_months,
      },
      monthsElapsed,
    ),
  );

  // 13. Sign-off block
  const last_published_at = currentYear.published_at;
  const days_stale = last_published_at
    ? Math.floor((Date.now() - new Date(last_published_at).getTime()) / 86_400_000)
    : null;
  const signoff = {
    current_year_status: currentYear.status,
    last_published_at,
    last_published_by: null,
    days_stale,
  };

  // 14. YoY
  const { data: allYears } = await sb
    .from('project_years')
    .select('id,year_index,fiscal_year,scenario,status')
    .eq('contract_id', args.contract_id)
    .order('year_index');
  const yoy: YoyRow[] = await Promise.all(
    ((allYears ?? []) as Array<{
      id: number;
      year_index: number;
      fiscal_year: number | null;
      scenario: 'initial' | 'revised' | 'reforecast';
      status: 'draft' | 'published';
    }>).map(async y => {
      if (y.id === currentYear.id) {
        return {
          year_id: y.id,
          year_index: y.year_index,
          fiscal_year: y.fiscal_year,
          scenario: y.scenario,
          status: y.status,
          revenue,
          expense: total_actual,
          gp: gp_abs,
          gp_pct,
          variance_pct,
          health: classifyVariance(variance_pct),
          drill_url: `/fmplus/performance/${args.contract_id}?year=${y.year_index}`,
        };
      }
      const v = await buildBudgetVarianceV2({
        contractId: args.contract_id,
        yearIndex: y.year_index,
        scenario: y.scenario,
      });
      const v_pct = v.total_budget > 0 ? (v.total_actual - v.total_budget) / v.total_budget : 0;
      return {
        year_id: y.id,
        year_index: y.year_index,
        fiscal_year: y.fiscal_year,
        scenario: y.scenario,
        status: y.status,
        revenue: 0,
        expense: v.total_actual,
        gp: 0,
        gp_pct: 0,
        variance_pct: v_pct,
        health: classifyVariance(v_pct),
        drill_url: `/fmplus/performance/${args.contract_id}?year=${y.year_index}`,
      };
    }),
  );

  // 15. Anomalies
  const anomalies = deriveAnomalies({
    contract_id: args.contract_id,
    manning,
    unmapped_total: variance.unmapped_actuals,
    period_total_actual: total_actual,
    forecast,
    signoff_days_stale: days_stale,
    vendors,
    amber_pct: 0.15,
  });

  const variance_ranked = [...service_lines].sort(
    (a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct),
  );

  const payload: ContractDashboardPayload = {
    meta: {
      contract_id: args.contract_id,
      contract_name: contractRow.name,
      customer: contractRow.customer,
      period: args.period,
      current_year_index: currentYear.year_index,
      current_year_id: currentYear.id,
    },
    kpis,
    service_lines,
    variance_ranked,
    manning,
    categories,
    unmapped,
    forecast,
    vendors,
    overtime,
    mobilization,
    signoff,
    yoy,
    anomalies,
  };

  if (args.compare) {
    const priorPeriod = resolvePriorPeriod(args.period);
    const prior = await buildContractDashboard({
      ...args,
      period: priorPeriod,
      compare: false,
    });
    const { meta: _meta, prior: _prior, ...rest } = prior;
    void _meta;
    void _prior;
    payload.prior = rest;
  }

  return payload;
}

function classifyVariance(pct: number): 'good' | 'warn' | 'bad' {
  const abs = Math.abs(pct);
  return abs <= 0.05 ? 'good' : abs <= 0.15 ? 'warn' : 'bad';
}

function elapsedMonths(year: { fiscal_year: number | null }, dateIso: string): number {
  const d = new Date(dateIso);
  const startYear = year.fiscal_year ?? d.getFullYear();
  const start = new Date(startYear, 0, 1);
  const diffMonths =
    (d.getFullYear() - start.getFullYear()) * 12 +
    (d.getMonth() - start.getMonth()) +
    1;
  return Math.max(0, Math.min(12, diffMonths));
}

async function sumManningOtBudget(
  sb: ReturnType<typeof supabaseAdmin>,
  year_id: number,
): Promise<number> {
  const { data } = await sb
    .from('budget_lines')
    .select('qty,ctc_ot')
    .eq('year_id', year_id)
    .eq('category', 'manning');
  return ((data ?? []) as Array<{ qty: number; ctc_ot: number | null }>).reduce(
    (a, r) => a + r.qty * (r.ctc_ot ?? 0),
    0,
  );
}
