import { supabaseAdmin } from '@/lib/supabase';
import type {
  ReportData,
  ReportMode,
  ReportLang,
  ContractInfo,
  YearInfo,
  ServiceLineSummary,
  ManningRow,
  BudgetCellMatrix,
  DeltaCell,
  RollupYearTotals,
} from './types';
import type { BudgetLine, MobilizationLine, ProjectYearSignoff, CustomerContact } from '../schema';
import type { ServiceLine, Category } from '../types';
import { applyVisibility } from './visibility';

// ---------- Load helpers ----------

export async function loadContract(contract_id: number): Promise<ContractInfo> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('project_contracts')
    .select(
      'id, name, customer, customer_logo_url, customer_contacts, start_date, end_date, duration_months, contract_value, vat_pct, zones, scope_summary, payment_terms, payment_terms_days',
    )
    .eq('id', contract_id)
    .single();
  if (error || !data) throw new Error(`Contract ${contract_id} not found: ${error?.message}`);
  return {
    id: data.id,
    name: data.name,
    customer: data.customer ?? null,
    customer_logo_url: data.customer_logo_url ?? null,
    customer_contacts: ((data.customer_contacts ?? []) as CustomerContact[]),
    start_date: data.start_date,
    end_date: data.end_date,
    duration_months: (data.duration_months as number | null) ?? 12,
    contract_value: Number(data.contract_value),
    vat_pct: Number(data.vat_pct),
    zones: ((data.zones ?? []) as string[]),
    scope_summary: data.scope_summary ?? null,
    payment_terms: data.payment_terms ?? null,
    payment_terms_days:
      (data as { payment_terms_days?: number | null }).payment_terms_days ?? null,
  };
}

export async function loadYear(year_id: number): Promise<YearInfo> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('project_years')
    .select('id, year_index, fiscal_year, scenario, status, start_month, contract_id')
    .eq('id', year_id)
    .single();
  if (error || !data) throw new Error(`Year ${year_id} not found: ${error?.message}`);
  return data as YearInfo;
}

export async function loadBudgetLines(year_id: number): Promise<BudgetLine[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('budget_lines').select('*').eq('year_id', year_id);
  return ((data ?? []) as BudgetLine[]);
}

export async function loadMobilization(contract_id: number): Promise<MobilizationLine[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('mobilization_lines').select('*').eq('contract_id', contract_id);
  return ((data ?? []) as MobilizationLine[]);
}

export async function loadSignoffs(year_id: number): Promise<ProjectYearSignoff[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('project_year_signoffs')
    .select('*')
    .eq('year_id', year_id)
    .order('signed_at', { ascending: false });
  return ((data ?? []) as ProjectYearSignoff[]);
}

/** For the change-vs-initial section: find the sibling year with same year_index but scenario='initial'. */
export async function loadInitialSiblingLines(
  contract_id: number,
  year_index: number,
): Promise<BudgetLine[] | null> {
  const sb = supabaseAdmin();
  const { data: sibling } = await sb
    .from('project_years')
    .select('id')
    .eq('contract_id', contract_id)
    .eq('year_index', year_index)
    .eq('scenario', 'initial')
    .maybeSingle();
  if (!sibling) return null;
  const { data: lines } = await sb.from('budget_lines').select('*').eq('year_id', sibling.id);
  return ((lines ?? []) as BudgetLine[]);
}

export async function loadAllYearsForContract(contract_id: number): Promise<YearInfo[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('project_years')
    .select('id, year_index, fiscal_year, scenario, status, start_month, contract_id')
    .eq('contract_id', contract_id)
    .order('year_index', { ascending: true });
  return ((data ?? []) as YearInfo[]);
}

export async function loadAllYearsLines(year_ids: number[]): Promise<BudgetLine[]> {
  if (year_ids.length === 0) return [];
  const sb = supabaseAdmin();
  const { data } = await sb.from('budget_lines').select('*').in('year_id', year_ids);
  return ((data ?? []) as BudgetLine[]);
}

// ---------- Aggregate ----------

interface AggregateInput {
  contract: ContractInfo;
  year: YearInfo;
  lines: BudgetLine[];
  mob: MobilizationLine[];
  signoffs: ProjectYearSignoff[];
  initialLines: BudgetLine[] | null;
  allYears: YearInfo[];
  rollupLines: BudgetLine[] | null;
  mode: ReportMode;
  lang: ReportLang;
  generated_at: string;
  generated_by: string;
}

export function aggregate(input: AggregateInput): ReportData {
  const { contract, year, lines, mob, signoffs, initialLines, allYears, rollupLines, mode, lang } =
    input;

  // Service-line summary
  const monthlyByService = bucketByService(lines);
  const totalMonthly = sum(Object.values(monthlyByService));
  const service_lines: ServiceLineSummary[] = Object.entries(monthlyByService).map(
    ([sl, monthly]) => {
      const share = totalMonthly > 0 ? monthly / totalMonthly : 0;
      const monthly_fee = (contract.contract_value * share) / 12;
      const annual_ex = monthly_fee * 12;
      return {
        service_line: sl as ServiceLine,
        hc_required: hcSum(lines, sl as ServiceLine, 'required'),
        hc_budgeted: hcSum(lines, sl as ServiceLine, 'budgeted'),
        monthly_cost: monthly,
        monthly_fee,
        annual_ex_vat: annual_ex,
        annual_incl_vat: annual_ex * (1 + contract.vat_pct / 100),
        gp_pct: monthly > 0 ? ((monthly_fee - monthly) / monthly_fee) * 100 : 0,
        gp_egp: monthly_fee - monthly,
      };
    },
  );

  // Manning rows (one per budget_line where category='manning')
  const manning: ManningRow[] = lines
    .filter((l) => l.category === 'manning')
    .map((l) => ({
      service_line: l.service_line as ServiceLine,
      sub_section: extractSubSection(l.line_code),
      position_label_en: l.label_en,
      position_label_ar: l.label_ar ?? null,
      hc_required: extractHcRequired(l),
      hc_budgeted: Number(l.qty),
      ctc_rate: Number(l.unit_cost),
      monthly_cost: Number(l.qty) * Number(l.unit_cost),
    }));

  // Budget breakdown matrix (8-cat × 7-svc)
  const cells: BudgetCellMatrix[] = buildMatrix(lines);
  const category_totals = sumByCategory(cells);
  const service_totals = Object.entries(monthlyByService).map(([sl, m]) => ({
    service_line: sl as ServiceLine,
    monthly: m,
  }));

  // Mobilization detail
  const mobDetail = mob.map((m) => ({
    category: m.category,
    label_en: m.label_en,
    label_ar: m.label_ar ?? null,
    qty: Number(m.qty),
    unit_cost: Number(m.unit_cost),
    total: Number(m.qty) * Number(m.unit_cost),
    amortization_months: m.amortization_months,
  }));
  const mobilization =
    mob.length === 0
      ? null
      : ({ detail: mobDetail } as { detail: typeof mobDetail });

  // Change vs initial — only when scenario != initial
  const change_vs_initial =
    year.scenario === 'initial'
      ? null
      : initialLines === null
        ? {
            cells: [],
            warning: 'No initial scenario found for this year — comparison unavailable.',
          }
        : { cells: computeDeltas(lines, initialLines), warning: null };

  // Contract rollup (multi-year only)
  const contract_rollup =
    allYears.length > 1 && rollupLines
      ? buildRollup(allYears, rollupLines, contract)
      : null;

  // Sign-off block — 2 lines per mode
  const signoff = {
    lines: getSignoffLines(mode),
    history: signoffs,
  };

  return {
    meta: {
      contract,
      year,
      mode,
      lang,
      generated_at: input.generated_at,
      generated_by: input.generated_by,
    },
    project_details: {
      customer_contacts: contract.customer_contacts,
      zones: contract.zones,
      scope_summary: contract.scope_summary,
      services: Array.from(new Set(lines.map((l) => l.service_line))) as ServiceLine[],
    },
    service_lines,
    manning: {
      rows: manning,
      totals_by_service: service_lines.reduce(
        (acc, s) => {
          acc[s.service_line] = {
            hc_required: s.hc_required,
            hc_budgeted: s.hc_budgeted,
          };
          return acc;
        },
        {} as Partial<Record<ServiceLine, { hc_required: number; hc_budgeted: number | null }>>,
      ),
    },
    budget_breakdown: { cells, category_totals, service_totals },
    mobilization,
    payment_terms: contract.payment_terms,
    payment_terms_days: contract.payment_terms_days,
    change_vs_initial,
    variance_snapshot: null, // populated separately for snapshot mode in C39
    contract_rollup,
    signoff,
  };
}

// ---------- Helper utilities ----------

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function bucketByService(lines: BudgetLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    out[l.service_line] = (out[l.service_line] ?? 0) + Number(l.qty) * Number(l.unit_cost);
  }
  return out;
}

function hcSum(
  lines: BudgetLine[],
  service: ServiceLine,
  kind: 'required' | 'budgeted',
): number {
  const m = lines.filter((l) => l.service_line === service && l.category === 'manning');
  if (kind === 'budgeted') return sum(m.map((l) => Number(l.qty)));
  return Math.round(sum(m.map((l) => Number(l.qty) * 0.85))); // approx HC required ~85% of budgeted
}

function extractSubSection(line_code: string): string | null {
  if (line_code.includes('_pub_')) return 'Public';
  if (line_code.includes('_pmp_')) return 'Pump Stations';
  if (line_code.includes('_int_')) return 'Internal';
  return null;
}

function extractHcRequired(l: BudgetLine): number {
  // No separate hc_required column; use ROUND(qty × 0.85) as approximation
  return Math.round(Number(l.qty) * 0.85);
}

function buildMatrix(lines: BudgetLine[]): BudgetCellMatrix[] {
  const map = new Map<string, BudgetCellMatrix>();
  for (const l of lines) {
    const key = `${l.service_line}::${l.category}`;
    const monthly = Number(l.qty) * Number(l.unit_cost);
    const existing = map.get(key);
    if (existing) {
      existing.monthly += monthly;
      existing.annual = existing.monthly * 12;
    } else {
      map.set(key, {
        service_line: l.service_line as ServiceLine,
        category: l.category as Category,
        monthly,
        annual: monthly * 12,
        green_amber_red: null,
      });
    }
  }
  return [...map.values()];
}

function sumByCategory(
  cells: BudgetCellMatrix[],
): { category: Category; monthly: number }[] {
  const map = new Map<Category, number>();
  for (const c of cells) {
    map.set(c.category, (map.get(c.category) ?? 0) + c.monthly);
  }
  return [...map.entries()].map(([category, monthly]) => ({ category, monthly }));
}

function computeDeltas(current: BudgetLine[], initial: BudgetLine[]): DeltaCell[] {
  const currMatrix = buildMatrix(current);
  const initMatrix = buildMatrix(initial);
  const cells: DeltaCell[] = [];
  for (const c of currMatrix) {
    const init = initMatrix.find(
      (i) => i.service_line === c.service_line && i.category === c.category,
    );
    const initial_monthly = init?.monthly ?? 0;
    const delta = c.monthly - initial_monthly;
    const delta_pct = initial_monthly > 0 ? (delta / initial_monthly) * 100 : 0;
    cells.push({
      service_line: c.service_line,
      category: c.category,
      initial_monthly,
      current_monthly: c.monthly,
      delta_monthly: delta,
      delta_pct,
      severity:
        Math.abs(delta_pct) > 15 ? 'high' : Math.abs(delta_pct) > 5 ? 'warn' : 'normal',
    });
  }
  return cells;
}

function buildRollup(
  allYears: YearInfo[],
  rollupLines: BudgetLine[],
  contract: ContractInfo,
): { years: RollupYearTotals[]; total_cost: number; total_revenue: number } {
  const years: RollupYearTotals[] = allYears.map((y) => {
    const yLines = rollupLines.filter((l) => l.year_id === y.id);
    const cost = sum(yLines.map((l) => Number(l.qty) * Number(l.unit_cost) * 12));
    const revenue = contract.contract_value; // simplified: assumes flat revenue per year
    return {
      year_index: y.year_index,
      fiscal_year: y.fiscal_year,
      scenario: y.scenario,
      total_cost: cost,
      total_revenue: revenue,
      gp_egp: revenue - cost,
      gp_pct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    };
  });
  return {
    years,
    total_cost: sum(years.map((y) => y.total_cost)),
    total_revenue: sum(years.map((y) => y.total_revenue)),
  };
}

function getSignoffLines(
  mode: ReportMode,
): { role: string; placeholder_en: string; placeholder_ar: string }[] {
  if (mode === 'customer')
    return [
      {
        role: 'fmplus_signatory',
        placeholder_en: 'FMPlus Authorized Signatory',
        placeholder_ar: 'المفوض بالتوقيع - FMPlus',
      },
      {
        role: 'customer_signatory',
        placeholder_en: 'Customer Authorized Signatory',
        placeholder_ar: 'المفوض بالتوقيع من العميل',
      },
    ];
  if (mode === 'signoff')
    return [
      {
        role: 'project_manager',
        placeholder_en: 'Project Manager',
        placeholder_ar: 'مدير المشروع',
      },
      {
        role: 'finance_director',
        placeholder_en: 'Finance Director',
        placeholder_ar: 'المدير المالي',
      },
    ];
  return [];
}

// ---------- Entry function ----------

export interface BuildReportInput {
  contract_id: number;
  year_id: number;
  mode: ReportMode;
  lang: ReportLang;
  generated_by?: string;
}

export async function buildProjectReport(input: BuildReportInput): Promise<ReportData> {
  const generated_at = new Date().toISOString();
  const generated_by = input.generated_by ?? 'system';

  // Steps 1-5: parallel
  const [contract, year, lines, mob, signoffs] = await Promise.all([
    loadContract(input.contract_id),
    loadYear(input.year_id),
    loadBudgetLines(input.year_id),
    loadMobilization(input.contract_id),
    loadSignoffs(input.year_id),
  ]);

  // Step 6: conditional initial sibling
  const initialLines =
    year.scenario !== 'initial'
      ? await loadInitialSiblingLines(input.contract_id, year.year_index)
      : null;

  // Step 7: conditional all-years rollup
  const allYears = await loadAllYearsForContract(input.contract_id);
  const rollupLines =
    allYears.length > 1 ? await loadAllYearsLines(allYears.map((y) => y.id)) : null;

  // Step 8: aggregate
  const data = aggregate({
    contract,
    year,
    lines,
    mob,
    signoffs,
    initialLines,
    allYears,
    rollupLines,
    mode: input.mode,
    lang: input.lang,
    generated_at,
    generated_by,
  });

  // Step 9: visibility strip
  return applyVisibility(data, input.mode);
}
