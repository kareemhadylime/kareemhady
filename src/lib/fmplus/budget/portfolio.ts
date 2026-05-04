import { budgetDb, TABLES } from './db';
import type { ServiceLine } from './types';

export interface PortfolioCard {
  contract_id: number;
  project_id: number;
  project_name: string;
  customer: string | null;
  year_tracking: 'contract' | 'fiscal';
  duration_months: number;
  contract_value: number;
  current_year_index: number;
  total_years: number;
  current_year_label: string;
  service_lines: ServiceLine[];
  has_back_office: boolean;
  current_year_revenue: number;
  current_year_status: 'draft' | 'published';
  yoy_revenue_change: number | null;
  mob_total: number;
  mob_roi_pct: number | null;
  health: 'green' | 'amber' | 'red';
}

export interface PortfolioFilter {
  service_line?: ServiceLine;
  q?: string;
}

/**
 * Aggregate every contract into a PortfolioCard for the Project Hub grid.
 * Pulls contracts + their nested years + per-year revenue + mobilization
 * in one round trip via PostgREST embeds, then derives KPIs in JS.
 *
 * Health is initially 'green'; downstream can override after running variance
 * (variance.ts isn't loaded here to keep this module fast).
 */
export async function buildPortfolio(filter: PortfolioFilter = {}): Promise<PortfolioCard[]> {
  const sb = budgetDb();
  let q = sb.from(TABLES.contracts).select(`
    id, project_id, name, customer, year_tracking, duration_months, contract_value,
    project_services ( service_line ),
    project_years ( id, year_index, fiscal_year, scenario, status, project_year_services ( service_line, monthly_revenue ) ),
    mobilization_lines ( total_cost )
  `);
  if (filter.q) q = q.ilike('name', `%${filter.q}%`);
  const { data, error } = await q.order('name');
  if (error) throw error;

  const cards: PortfolioCard[] = [];
  for (const c of (data ?? []) as any[]) {
    const services: ServiceLine[] = (c.project_services ?? []).map((s: any) => s.service_line);
    if (filter.service_line && !services.includes(filter.service_line)) continue;

    const initialYears = (c.project_years ?? [])
      .filter((y: any) => y.scenario === 'initial')
      .sort((a: any, b: any) => a.year_index - b.year_index);
    const totalYears = initialYears.length
      ? Math.max(...initialYears.map((y: any) => y.year_index))
      : 0;
    const currentYear = initialYears[initialYears.length - 1] ?? null;
    const prevYear = initialYears[initialYears.length - 2] ?? null;

    const sumYearRevenue = (yr: any | null) =>
      yr ? (yr.project_year_services ?? []).reduce(
        (a: number, s: any) => a + Number(s.monthly_revenue) * 12, 0
      ) : 0;
    const currentRevenue = sumYearRevenue(currentYear);
    const prevRevenue = sumYearRevenue(prevYear);
    const yoy = prevYear && prevRevenue > 0
      ? (currentRevenue - prevRevenue) / prevRevenue
      : null;

    const mobTotal = (c.mobilization_lines ?? []).reduce(
      (a: number, m: any) => a + Number(m.total_cost), 0
    );
    const cv = Number(c.contract_value);
    const mobRoi = cv > 0 ? mobTotal / cv : null;

    cards.push({
      contract_id: c.id,
      project_id: c.project_id,
      project_name: c.name,
      customer: c.customer,
      year_tracking: c.year_tracking,
      duration_months: c.duration_months,
      contract_value: cv,
      current_year_index: currentYear?.year_index ?? 0,
      total_years: totalYears,
      current_year_label: currentYear
        ? (c.year_tracking === 'fiscal' && currentYear.fiscal_year
            ? `FY ${currentYear.fiscal_year}`
            : `Y${currentYear.year_index}${totalYears > 1 ? ` of ${totalYears}` : ''}`)
        : '—',
      service_lines: services,
      has_back_office: services.includes('back_office'),
      current_year_revenue: currentRevenue,
      current_year_status: (currentYear?.status ?? 'draft') as 'draft' | 'published',
      yoy_revenue_change: yoy,
      mob_total: mobTotal,
      mob_roi_pct: mobRoi,
      health: 'green',
    });
  }
  return cards;
}
