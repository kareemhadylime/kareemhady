// src/lib/fmplus/performance/build-dashboard.ts
import { supabaseAdmin } from '@/lib/supabase';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import { resolvePriorPeriod } from './period';
import { weightedAvgCtc, impliedHeadcount } from './derive-implied-hc';
import { linearForecast } from './derive-forecast';
import { computeMobAmortization } from './derive-mobilization';
import { computeOvertimeBlock } from './derive-overtime';
import { topVendors } from './derive-vendors';
import { arAging } from './derive-ar-aging';
import { actualRevenue } from './derive-actual-revenue';
import { deriveAnomalies } from './derive-anomalies';
import { unmappedLines } from './derive-unmapped';
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

/**
 * Return the set of month numbers (1..12) within a contract year window that
 * are touched by the selected period.
 *
 * "Touched" = ANY day in the calendar month falls within [period.from, period.to].
 * For chip presets (prev-month, last-3, last-quarter, ytd, last-year) this is always a
 * contiguous run of whole months. For Custom ranges the user may supply partial
 * months — we include any month with any overlap.
 *
 * The contract year may run on a calendar fiscal or a contract-start year. We
 * simply intersect the period dates with month-of-year, ignoring year boundaries.
 * This is correct as long as the period falls entirely within the contract year
 * the dashboard is loaded for, which is the v1 invariant. Cross-year periods are
 * an edge case left for a follow-up.
 */
function periodMonthNumbers(period: { from: string; to: string }): Set<number> {
  const months = new Set<number>();
  const from = new Date(period.from);
  const to = new Date(period.to);
  // Walk month-by-month from `from`'s month-start to `to`'s month-end.
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor.getTime() <= end.getTime()) {
    months.add(cursor.getMonth() + 1); // 1..12
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

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
    .select('id,name,customer,project_id,contract_value,start_date,end_date,payment_terms_days')
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
    payment_terms_days: number | null;
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

  // 3b. Period slicing — derive sliced budget/actual per category from cells[]
  // (the year totals on segments/categories are FULL YEAR; period chips need
  // only the months they cover).
  const periodMonths = periodMonthNumbers(args.period);

  function sliceCategory(
    cat: { cells: Array<{ month: number; budget: number; actual: number }> },
  ): { budget: number; actual: number } {
    let budget = 0;
    let actual = 0;
    for (const c of cat.cells ?? []) {
      if (!periodMonths.has(c.month)) continue;
      budget += c.budget;
      actual += c.actual;
    }
    return { budget, actual };
  }

  // 3c. Revenue resolution — prefer Odoo actuals, then service_revenue, then contract_value
  type RevenueSource = 'odoo_actual' | 'service_revenue' | 'contract_value_fallback' | 'none';
  let revenueSource: RevenueSource = 'none';
  let totalPeriodRevenue = 0;

  // Tier 1: Odoo actual revenue for the period
  const odooRev = await actualRevenue({
    project_id: contractRow.project_id,
    from: args.period.from,
    to: args.period.to,
  });
  if (odooRev > 0) {
    totalPeriodRevenue = odooRev;
    revenueSource = 'odoo_actual';
  }

  // Tier 2: project_year_services.monthly_revenue (also load for per-service split)
  const { data: revRows } = await sb
    .from('project_year_services')
    .select('service_line,monthly_revenue')
    .eq('year_id', currentYear.id);
  const monthlyRevenuePerService: Partial<Record<ServiceLine, number>> = {};
  for (const r of (revRows ?? []) as Array<{ service_line: ServiceLine; monthly_revenue: number | string | null }>) {
    monthlyRevenuePerService[r.service_line] = Number(r.monthly_revenue ?? 0) || 0;
  }
  const sumServiceMonthlyRevenue = Object.values(monthlyRevenuePerService).reduce(
    (a, v) => a + (v ?? 0),
    0,
  );

  // Per-service monthly BUDGET map — used for fallback distribution.
  // cells[].budget on a category is per-month; sum of category-monthly-budget across
  // categories within a segment = service-line monthly budget.
  const monthlyBudgetPerService: Partial<Record<ServiceLine, number>> = {};
  for (const seg of variance.segments ?? []) {
    let monthlyForSvc = 0;
    for (const cat of seg.categories ?? []) {
      // Take any month with a non-zero budget as a representative monthly budget per
      // category (templates use a uniform monthly value, so this is stable). If all
      // months are 0, contributes 0.
      const sample = (cat.cells ?? []).find(c => (c.budget ?? 0) > 0)?.budget ?? 0;
      monthlyForSvc += sample;
    }
    monthlyBudgetPerService[seg.service_line] = monthlyForSvc;
  }
  const totalMonthlyBudget = Object.values(monthlyBudgetPerService).reduce(
    (a, v) => a + (v ?? 0),
    0,
  );

  const annualContractValue = Number(contractRow.contract_value ?? 0);
  const monthsInPeriod = periodMonths.size;

  // If Odoo actuals didn't cover, fall through to lower tiers.
  if (revenueSource !== 'odoo_actual') {
    if (sumServiceMonthlyRevenue > 0) {
      revenueSource = 'service_revenue';
      totalPeriodRevenue = sumServiceMonthlyRevenue * monthsInPeriod;
    } else if (annualContractValue > 0) {
      revenueSource = 'contract_value_fallback';
      totalPeriodRevenue = (annualContractValue / 12) * monthsInPeriod;
    } else {
      revenueSource = 'none';
      totalPeriodRevenue = 0;
    }
  }

  // Per-service revenue distribution (used for per-service GP%).
  // - When service_revenue exists, use the per-service breakdown × months.
  // - Otherwise distribute totalPeriodRevenue by budget share (or equally).
  const periodRevenuePerService: Partial<Record<ServiceLine, number>> = {};
  if (sumServiceMonthlyRevenue > 0 && revenueSource !== 'odoo_actual') {
    for (const [svc, monthly] of Object.entries(monthlyRevenuePerService) as Array<[ServiceLine, number]>) {
      periodRevenuePerService[svc] = (monthly ?? 0) * monthsInPeriod;
    }
  } else if (totalMonthlyBudget > 0) {
    for (const seg of variance.segments ?? []) {
      const svc = seg.service_line;
      const svcMonthlyBudget = monthlyBudgetPerService[svc] ?? 0;
      periodRevenuePerService[svc] = totalPeriodRevenue * (svcMonthlyBudget / totalMonthlyBudget);
    }
  } else {
    const svcs = (variance.segments ?? []).map(s => s.service_line);
    if (svcs.length > 0) {
      const each = totalPeriodRevenue / svcs.length;
      for (const svc of svcs) periodRevenuePerService[svc] = each;
    }
  }

  function periodRevenueForService(svc: ServiceLine): number {
    return periodRevenuePerService[svc] ?? 0;
  }

  // 4. Service-line rollup rows (period-sliced)
  const service_lines: ServiceLineRow[] = (variance.segments ?? []).map(s => {
    let segBudget = 0;
    let segActual = 0;
    for (const cat of s.categories ?? []) {
      const sliced = sliceCategory(cat);
      segBudget += sliced.budget;
      segActual += sliced.actual;
    }
    const variance_abs = segActual - segBudget;
    const variance_pct = segBudget > 0 ? variance_abs / segBudget : 0;
    const periodRevenue = periodRevenueForService(s.service_line);
    const gp_pct = periodRevenue > 0 ? (periodRevenue - segActual) / periodRevenue : 0;
    return {
      service_line: s.service_line,
      service_label: SERVICE_LABELS[s.service_line] ?? String(s.service_line),
      budget: segBudget,
      actual: segActual,
      variance_abs,
      variance_pct,
      gp_pct,
      status: classifyVariance(variance_pct),
      drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&service=${s.service_line}&from=${args.period.from}&to=${args.period.to}`,
    };
  });

  // 5. Manning panel (period-sliced)
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
      const sliced = manningCat ? sliceCategory(manningCat) : { budget: 0, actual: 0 };
      const spend_actual = sliced.actual;
      const spend_budget = sliced.budget;
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

  // 6. Category rollup across all service lines (period-sliced)
  const catTotals: Record<Category, { budget: number; actual: number }> = Object.fromEntries(
    Object.keys(CATEGORY_LABELS).map(c => [c, { budget: 0, actual: 0 }]),
  ) as Record<Category, { budget: number; actual: number }>;
  for (const seg of variance.segments ?? []) {
    for (const c of seg.categories) {
      const t = catTotals[c.category];
      if (!t) continue;
      const sliced = sliceCategory(c);
      t.budget += sliced.budget;
      t.actual += sliced.actual;
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

  // 7. Unmapped actuals — per-line list of GL move lines that hit the
  // contract's analytic in the period but didn't match any service template's
  // code_patterns. variance v2 only exposes the rollup number, so we re-query
  // here for the drillable list. Loads template_version from project_services
  // (per-contract) to make sure the right pattern set is used.
  const { data: svcRows } = await sb
    .from('project_services')
    .select('service_line,template_version')
    .eq('contract_id', args.contract_id);
  const tplVersionByService = new Map<ServiceLine, number>();
  for (const r of (svcRows ?? []) as Array<{ service_line: ServiceLine; template_version: number | null }>) {
    if (r.template_version != null) tplVersionByService.set(r.service_line, r.template_version);
  }
  const servicesForUnmap = (variance.segments ?? []).map(s => ({
    service_line: s.service_line as ServiceLine,
    template_version: tplVersionByService.get(s.service_line as ServiceLine) ?? 1,
  }));
  const unmapped: UnmappedLine[] = await unmappedLines({
    contract_id: args.contract_id,
    project_id: contractRow.project_id,
    period_from: args.period.from,
    period_to: args.period.to,
    services: servicesForUnmap,
  });

  // 8. KPIs (period-sliced — totals derived from sliced service_lines)
  const total_budget = service_lines.reduce((a, s) => a + s.budget, 0);
  const total_actual = service_lines.reduce((a, s) => a + s.actual, 0);
  const variance_pct = total_budget > 0 ? (total_actual - total_budget) / total_budget : 0;
  const revenue = totalPeriodRevenue;
  const gp_abs = revenue - total_actual;
  const gp_pct = revenue > 0 ? gp_abs / revenue : 0;

  const kpis: KpiTile[] = [
    { id: 'revenue',      label: 'Revenue',     value: revenue,      unit: 'EGP-M', variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
    { id: 'expense',      label: 'Expense',     value: total_actual, unit: 'EGP-M', variance_pct, variance_abs: total_actual - total_budget, status: classifyVariance(variance_pct), spark: [] },
    { id: 'gp',           label: 'GP',          value: gp_abs,       unit: 'EGP-M', variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
    { id: 'gp_pct',       label: 'GP %',        value: gp_pct,       unit: '%',     variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
    { id: 'variance_pct', label: 'Expense Variance %',  value: variance_pct, unit: '%',     variance_pct, variance_abs: 0,                   status: classifyVariance(variance_pct), spark: [] },
  ];

  // 9. Forecast — project full-year actual from the run-rate observed in the
  // selected period. months_elapsed = number of months in the period; period_actual
  // = sliced actual; budget_year = full-year budget (NOT sliced — we're comparing
  // a projected full year against the full-year budget plan).
  const monthsElapsed = elapsedMonths(currentYear, args.period.to);
  const forecast = linearForecast({
    period_actual: total_actual,
    months_elapsed: periodMonths.size,
    months_total: 12,
    budget_year: variance.total_budget,
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

  // 11b. AR Aging (parallel to vendors / overtime)
  const ar_aging = await arAging({
    project_id: contractRow.project_id,
    payment_terms_days: contractRow.payment_terms_days ?? null,
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
        // YoY arc shows full-year totals per year — NOT the period-sliced values
        // used elsewhere on the dashboard. We re-use the already-loaded variance
        // backbone (which is full-year) for the current year.
        const fyYear = y.fiscal_year ?? new Date().getFullYear();
        const yearOdooRev = await actualRevenue({
          project_id: contractRow.project_id,
          from: `${fyYear}-01-01`,
          to: `${fyYear}-12-31`,
        });
        const yearRevenue =
          yearOdooRev > 0
            ? yearOdooRev
            : sumServiceMonthlyRevenue > 0
              ? sumServiceMonthlyRevenue * 12
              : annualContractValue > 0
                ? annualContractValue
                : 0;
        const yearExpense = variance.total_actual;
        const yearGp = yearRevenue - yearExpense;
        const yearGpPct = yearRevenue > 0 ? yearGp / yearRevenue : 0;
        const yearVariancePct =
          variance.total_budget > 0
            ? (variance.total_actual - variance.total_budget) / variance.total_budget
            : 0;
        return {
          year_id: y.id,
          year_index: y.year_index,
          fiscal_year: y.fiscal_year,
          scenario: y.scenario,
          status: y.status,
          revenue: yearRevenue,
          expense: yearExpense,
          gp: yearGp,
          gp_pct: yearGpPct,
          variance_pct: yearVariancePct,
          health: classifyVariance(yearVariancePct),
          drill_url: `/fmplus/performance/${args.contract_id}?year=${y.year_index}`,
        };
      }
      const v = await buildBudgetVarianceV2({
        contractId: args.contract_id,
        yearIndex: y.year_index,
        scenario: y.scenario,
      });
      const { data: yRevRows } = await sb
        .from('project_year_services')
        .select('monthly_revenue')
        .eq('year_id', y.id);
      const yMonthlyRev = ((yRevRows ?? []) as Array<{ monthly_revenue: number | string | null }>)
        .reduce((a, r) => a + (Number(r.monthly_revenue ?? 0) || 0), 0);
      // Tier 1 for prior years: Odoo actuals if we know the fiscal year.
      const yOdooRev = y.fiscal_year != null
        ? await actualRevenue({
            project_id: contractRow.project_id,
            from: `${y.fiscal_year}-01-01`,
            to: `${y.fiscal_year}-12-31`,
          })
        : 0;
      const yRevenue = yOdooRev > 0
        ? yOdooRev
        : yMonthlyRev > 0
          ? yMonthlyRev * 12
          : annualContractValue;
      const yExpense = v.total_actual;
      const yGp = yRevenue - yExpense;
      const yGpPct = yRevenue > 0 ? yGp / yRevenue : 0;
      const v_pct = v.total_budget > 0 ? (v.total_actual - v.total_budget) / v.total_budget : 0;
      return {
        year_id: y.id,
        year_index: y.year_index,
        fiscal_year: y.fiscal_year,
        scenario: y.scenario,
        status: y.status,
        revenue: yRevenue,
        expense: yExpense,
        gp: yGp,
        gp_pct: yGpPct,
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
    ar_overdue_amount: ar_aging?.overdue_amount ?? 0,
    ar_overdue_count: ar_aging?.overdue_count ?? 0,
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
      revenue_source: revenueSource,
    },
    kpis,
    service_lines,
    variance_ranked,
    manning,
    categories,
    unmapped,
    forecast,
    vendors,
    ar_aging,
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
