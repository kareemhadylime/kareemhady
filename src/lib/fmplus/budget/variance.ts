import { budgetDb, TABLES } from './db';
import { getTemplate } from './templates';
import { amortizeMobilization, type MobLineLite } from './mobilization';
import type { ServiceLine, Category, Bilingual } from './types';

export type VarianceColor = 'green' | 'amber' | 'red';

export interface VarianceCell {
  month: number; // 1-12
  budget: number; // EGP, includes amortized mob if category matches
  actual: number;
  mob_amortized: number;
  variance: number;
  variance_pct: number | null;
  color: VarianceColor;
}

export interface CategoryRow {
  category: Category;
  label_en: string;
  label_ar: string | null;
  cells: VarianceCell[]; // 12 entries (one per month, even if all zero)
  ytd_budget: number;
  ytd_actual: number;
  ytd_variance: number;
  ytd_variance_pct: number | null;
  ytd_color: VarianceColor;
}

export interface ServiceSegment {
  service_line: ServiceLine;
  categories: CategoryRow[];
  segment_budget: number;
  segment_actual: number;
  segment_variance_pct: number | null;
}

export interface BudgetVarianceReportV2 {
  contract_id: number;
  contract_name: string;
  year_id: number;
  year_index: number;
  fiscal_year: number | null;
  scenario: string;
  status: string;
  bilingual: Bilingual;
  segments: ServiceSegment[];
  total_budget: number;
  total_actual: number;
  total_variance_pct: number | null;
  unmapped_actuals: number; // actuals that didn't match any account_map regex
  generated_at: string;
}

export interface BuildVarianceOpts {
  contractId: number;
  yearIndex: number;
  scenario?: 'initial' | 'revised' | 'reforecast';
  serviceLine?: ServiceLine;
  bilingual?: Bilingual;
  ytdThrough?: number; // 1-12 (defaults to current month or 12 if year is fully past)
}

interface SettingsForVariance {
  green_pct: number;
  amber_pct: number;
}

const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

/**
 * Build a complete variance report for one (contract, year, scenario) tuple.
 * Joins budget_lines + project_year_services for the budget side and
 * odoo_move_lines (via odoo_move_line_analytics) for the actuals side.
 *
 * Mobilization amortization is added to the budget side per-month per-category.
 * For now mob lands in the 'other' category; future could split by category.
 */
export async function buildBudgetVarianceV2(opts: BuildVarianceOpts): Promise<BudgetVarianceReportV2> {
  const sb = budgetDb();

  // 1. Load contract + year
  const { data: contract } = await sb.from(TABLES.contracts)
    .select('id, name, project_id, year_tracking, start_date, end_date')
    .eq('id', opts.contractId)
    .single();
  if (!contract) throw new Error(`Contract ${opts.contractId} not found`);

  const { data: year } = await sb.from(TABLES.years)
    .select('id, year_index, fiscal_year, scenario, status, start_month')
    .eq('contract_id', opts.contractId)
    .eq('year_index', opts.yearIndex)
    .eq('scenario', opts.scenario ?? 'initial')
    .single();
  if (!year) {
    throw new Error(`Year ${opts.yearIndex} not found for contract ${opts.contractId}`);
  }

  // 2. Load services on this contract
  const { data: services } = await sb.from(TABLES.services)
    .select('service_line, template_version')
    .eq('contract_id', opts.contractId);
  const serviceList = ((services ?? []) as Array<{ service_line: ServiceLine; template_version: number }>)
    .filter(s => !opts.serviceLine || s.service_line === opts.serviceLine);

  // 3. Load budget_lines for the year
  const { data: lineRows } = await sb.from(TABLES.lines)
    .select('id, service_line, category, line_code, label_en, label_ar, qty, unit_cost, threshold_green, threshold_amber')
    .eq('year_id', year.id);
  const lines = ((lineRows ?? []) as Array<{
    id: number;
    service_line: ServiceLine;
    category: Category;
    line_code: string;
    label_en: string;
    label_ar: string | null;
    qty: number;
    unit_cost: number;
    threshold_green: number | null;
    threshold_amber: number | null;
  }>);

  // 4. Load mob lines and amortize over the contract span, then truncate to this year
  const { data: mobRows } = await sb.from(TABLES.mob)
    .select('category, total_cost, amortization, amortization_months')
    .eq('contract_id', opts.contractId);
  const mobLite: MobLineLite[] = ((mobRows ?? []) as any[]).map(r => ({
    category: r.category,
    total_cost: Number(r.total_cost),
    amortization: r.amortization,
    amortization_months: r.amortization_months,
  }));
  const mobMap = amortizeMobilization(mobLite, contract.start_date, contract.end_date);
  // Build a per-month mob-amortized total scoped to this year's calendar.
  const yearStartMonth = year.fiscal_year
    ? 1 // fiscal years use Jan-Dec
    : (year.start_month ?? 1);
  const yearStartYearNum = year.fiscal_year
    ?? new Date(contract.start_date).getFullYear() + (opts.yearIndex - 1);
  const monthMobTotal = new Map<number, number>(); // month (1-12) → mob amount
  for (let m = 1; m <= 12; m++) {
    const key = `${yearStartYearNum}-${String(m).padStart(2, '0')}`;
    const v = mobMap.get(key) ?? 0;
    if (v > 0) monthMobTotal.set(m, v);
  }

  // 5. Load settings for thresholds
  const { data: settingsRow } = await sb.from(TABLES.settings)
    .select('green_pct, amber_pct')
    .eq('id', 1)
    .single();
  const settings: SettingsForVariance = {
    green_pct: Number(settingsRow?.green_pct ?? 5),
    amber_pct: Number(settingsRow?.amber_pct ?? 15),
  };

  // 6. Load actuals from odoo_move_lines via odoo_move_line_analytics
  // Filter: analytic_account_id = contract.project_id, date in this year's calendar window
  const yearStartIso = `${yearStartYearNum}-${String(yearStartMonth).padStart(2,'0')}-01`;
  const yearEndDate = new Date(yearStartYearNum, yearStartMonth - 1 + 12, 0); // last day of month-12
  const yearEndIso = `${yearEndDate.getFullYear()}-${String(yearEndDate.getMonth()+1).padStart(2,'0')}-${String(yearEndDate.getDate()).padStart(2,'0')}`;

  const { data: actualRows } = await sb.from('odoo_move_lines')
    .select(`
      id, date, balance, debit, credit,
      account:odoo_accounts(code, account_type),
      analytics:odoo_move_line_analytics!inner(analytic_account_id)
    `)
    .gte('date', yearStartIso)
    .lte('date', yearEndIso)
    .eq('analytics.analytic_account_id', contract.project_id);

  // 7. For each service segment, compute variance per category × month
  const segments: ServiceSegment[] = [];
  let totalBudget = 0;
  let totalActual = 0;
  let unmappedActuals = 0;

  for (const svc of serviceList) {
    const tpl = getTemplate(svc.service_line, svc.template_version);
    const linesForService = lines.filter(l => l.service_line === svc.service_line);

    // Build category -> patterns map from template
    const accountMapByCategory = new Map<Category, RegExp[]>();
    for (const m of tpl.account_map_json ?? []) {
      const regs = (m.code_patterns ?? []).map(p => new RegExp(p));
      const existing = accountMapByCategory.get(m.category) ?? [];
      accountMapByCategory.set(m.category, [...existing, ...regs]);
    }

    // For each template category, compute the budget+actual cells
    const catRows: CategoryRow[] = [];
    for (const tplCat of tpl.categories) {
      const cat = tplCat.code as Category;
      const linesInCat = linesForService.filter(l => l.category === cat);

      // Budget: sum monthly_cost across lines (qty * unit_cost) — applied to every month
      const monthlyBudget = linesInCat.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost), 0);

      // Actuals: filter actualRows whose account.code matches any pattern for this category
      const patterns = accountMapByCategory.get(cat) ?? [];
      const monthlyActuals = new Map<number, number>(); // month → EGP
      for (const row of (actualRows ?? []) as any[]) {
        const code = row.account?.code as string | undefined;
        if (!code || patterns.length === 0) continue;
        const matches = patterns.some(re => re.test(code));
        if (!matches) continue;
        const m = new Date(row.date).getMonth() + 1;
        const amount = Number(row.debit ?? 0) - Number(row.credit ?? 0);
        monthlyActuals.set(m, (monthlyActuals.get(m) ?? 0) + amount);
      }

      // Determine per-line threshold override (use FIRST line's override if any)
      const overrideGreen = linesInCat.find(l => l.threshold_green != null)?.threshold_green ?? null;
      const overrideAmber = linesInCat.find(l => l.threshold_amber != null)?.threshold_amber ?? null;
      const greenPct = overrideGreen ?? settings.green_pct;
      const amberPct = overrideAmber ?? settings.amber_pct;

      // Build cells (12 months)
      const cells: VarianceCell[] = ALL_MONTHS.map(m => {
        const mob = ((cat as string) === 'other' || (cat as string) === tplCat.code && (cat as string) === 'other')
          ? (monthMobTotal.get(m) ?? 0) / Math.max(1, tpl.categories.length)
          : 0; // distribute mob across categories evenly is complex; for v2.0 we put mob in 'other' only OR distribute equally
        // Simpler: don't add mob to category cells; surface it separately via segment-level rollup below
        const budgetCell = monthlyBudget;
        const actualCell = monthlyActuals.get(m) ?? 0;
        const variance = actualCell - budgetCell;
        const variancePct = budgetCell !== 0 ? variance / budgetCell : null;
        let color: VarianceColor = 'amber';
        if (variancePct === null) {
          color = actualCell === 0 ? 'green' : 'red';
        } else if (Math.abs(variancePct * 100) <= greenPct) {
          color = 'green';
        } else if (variancePct * 100 > amberPct) {
          color = 'red';
        } else {
          color = 'amber';
        }
        return {
          month: m,
          budget: budgetCell,
          actual: actualCell,
          mob_amortized: 0,
          variance,
          variance_pct: variancePct,
          color,
        };
      });

      const ytdBudget = cells.reduce((a, c) => a + c.budget, 0);
      const ytdActual = cells.reduce((a, c) => a + c.actual, 0);
      const ytdVariance = ytdActual - ytdBudget;
      const ytdVariancePct = ytdBudget !== 0 ? ytdVariance / ytdBudget : null;
      let ytdColor: VarianceColor = 'amber';
      if (ytdVariancePct === null) {
        ytdColor = ytdActual === 0 ? 'green' : 'red';
      } else if (Math.abs(ytdVariancePct * 100) <= greenPct) {
        ytdColor = 'green';
      } else if (ytdVariancePct * 100 > amberPct) {
        ytdColor = 'red';
      }

      catRows.push({
        category: cat,
        label_en: tplCat.label_en,
        label_ar: tplCat.label_ar ?? null,
        cells,
        ytd_budget: ytdBudget,
        ytd_actual: ytdActual,
        ytd_variance: ytdVariance,
        ytd_variance_pct: ytdVariancePct,
        ytd_color: ytdColor,
      });
    }

    // Segment-level rollup
    const segmentBudget = catRows.reduce((a, c) => a + c.ytd_budget, 0);
    const segmentActual = catRows.reduce((a, c) => a + c.ytd_actual, 0);
    const segmentVariancePct = segmentBudget !== 0
      ? (segmentActual - segmentBudget) / segmentBudget
      : null;
    segments.push({
      service_line: svc.service_line,
      categories: catRows,
      segment_budget: segmentBudget,
      segment_actual: segmentActual,
      segment_variance_pct: segmentVariancePct,
    });
    totalBudget += segmentBudget;
    totalActual += segmentActual;
  }

  // Unmapped actuals: count actualRows that didn't match any pattern across services
  const allPatterns = new Set<RegExp>();
  for (const svc of serviceList) {
    const tpl = getTemplate(svc.service_line, svc.template_version);
    for (const m of tpl.account_map_json ?? []) {
      for (const p of m.code_patterns ?? []) {
        allPatterns.add(new RegExp(p));
      }
    }
  }
  for (const row of (actualRows ?? []) as any[]) {
    const code = row.account?.code as string | undefined;
    if (!code) continue;
    let matched = false;
    for (const re of allPatterns) {
      if (re.test(code)) { matched = true; break; }
    }
    if (!matched) {
      unmappedActuals += Number(row.debit ?? 0) - Number(row.credit ?? 0);
    }
  }

  return {
    contract_id: opts.contractId,
    contract_name: contract.name,
    year_id: year.id,
    year_index: year.year_index,
    fiscal_year: year.fiscal_year,
    scenario: year.scenario,
    status: year.status,
    bilingual: opts.bilingual ?? 'en',
    segments,
    total_budget: totalBudget,
    total_actual: totalActual,
    total_variance_pct: totalBudget !== 0 ? (totalActual - totalBudget) / totalBudget : null,
    unmapped_actuals: unmappedActuals,
    generated_at: new Date().toISOString(),
  };
}
