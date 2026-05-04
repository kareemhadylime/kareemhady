// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import type { Season, AccountMapJsonT } from './schema';
import type { VarianceColor, VarianceCell, CategoryVariance, SegmentVariance, BudgetVarianceReport } from './types';
import type { Scenario, ServiceLine } from './schema';
import { supabaseAdmin } from '@/lib/supabase';
import { getTemplate } from './templates/index';

export type AggregatedBudgetCell = {
  segment_id: number;
  category: string;
  month: number;
  budget: number;
};

export type BudgetLineForAgg = {
  segment_id: number;
  category: string;
  season: Season;
  monthly_cost: number;
};

export function matchAccountToCategory(
  accountCode: string,
  map: AccountMapJsonT,
): string | null {
  for (const entry of map) {
    for (const pattern of entry.code_patterns) {
      if (new RegExp(pattern).test(accountCode)) return entry.category;
    }
  }
  return null;
}

export type MoveLineForAgg = {
  date: string;
  balance: number;
  account_code: string;
};

export type AggregatedActualCell = {
  segment_id: number;
  category: string;
  month: number;
  actual: number;
};

export function aggregateActualsByMonth(
  moveLines: MoveLineForAgg[],
  map: AccountMapJsonT,
  segmentId: number,
): { cells: AggregatedActualCell[]; unmappedTotal: number } {
  const buckets = new Map<string, number>();
  let unmappedTotal = 0;
  for (const ml of moveLines) {
    const month = new Date(ml.date).getUTCMonth() + 1;
    const cat = matchAccountToCategory(ml.account_code, map);
    if (!cat) {
      unmappedTotal += Number(ml.balance);
      continue;
    }
    const k = `${cat}|${month}`;
    buckets.set(k, (buckets.get(k) ?? 0) + Number(ml.balance));
  }
  const cells: AggregatedActualCell[] = [];
  for (const [k, actual] of buckets.entries()) {
    const [category, monthStr] = k.split('|');
    cells.push({ segment_id: segmentId, category, month: Number(monthStr), actual });
  }
  return { cells, unmappedTotal };
}

export function aggregateBudgetByMonth(
  lines: BudgetLineForAgg[],
  seasonMonths: { high: number[]; low: number[] },
  startMonth: number,
): AggregatedBudgetCell[] {
  const seasonTotal = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.segment_id}|${l.category}|${l.season}`;
    seasonTotal.set(k, (seasonTotal.get(k) ?? 0) + Number(l.monthly_cost));
  }
  const out: AggregatedBudgetCell[] = [];
  for (const [k, total] of seasonTotal.entries()) {
    const [segIdStr, category, season] = k.split('|');
    const months = season === 'high' ? seasonMonths.high : seasonMonths.low;
    for (const month of months) {
      out.push({
        segment_id: Number(segIdStr),
        category,
        month,
        budget: month >= startMonth ? total : 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// colorVariance + computeCellRollup
// ---------------------------------------------------------------------------

export type ThresholdConfig = { green: number; amber: number };

export function colorVariance(variancePct: number | null, thr: ThresholdConfig): VarianceColor {
  if (variancePct == null) return 'green';
  if (Math.abs(variancePct) <= thr.green) return 'green';
  if (variancePct > thr.amber) return 'red';
  return 'amber';
}

export type RolledCell = {
  segment_id: number;
  category: string;
  month: number;
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
  color: VarianceColor;
};

export function computeCellRollup(
  budget: AggregatedBudgetCell[],
  actuals: AggregatedActualCell[],
  thr: ThresholdConfig,
): RolledCell[] {
  const actMap = new Map<string, number>();
  for (const a of actuals) {
    actMap.set(`${a.segment_id}|${a.category}|${a.month}`, a.actual);
  }
  const out: RolledCell[] = [];
  const seen = new Set<string>();
  for (const b of budget) {
    const k = `${b.segment_id}|${b.category}|${b.month}`;
    seen.add(k);
    const actual = actMap.get(k) ?? 0;
    const variance = actual - b.budget;
    const variance_pct = b.budget === 0 ? null : (variance / b.budget) * 100;
    out.push({
      segment_id: b.segment_id, category: b.category, month: b.month,
      budget: b.budget, actual, variance, variance_pct,
      color: colorVariance(variance_pct, thr),
    });
  }
  for (const a of actuals) {
    const k = `${a.segment_id}|${a.category}|${a.month}`;
    if (seen.has(k)) continue;
    out.push({
      segment_id: a.segment_id, category: a.category, month: a.month,
      budget: 0, actual: a.actual, variance: a.actual, variance_pct: null,
      color: 'green',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildBudgetVariance orchestrator
// ---------------------------------------------------------------------------

function sumCellsYtd(
  cells: VarianceCell[],
  ytdThrough: number,
  thr: ThresholdConfig,
): VarianceCell {
  const ytdCells = cells.filter(c => c.month <= ytdThrough);
  const budget = ytdCells.reduce((s, c) => s + c.budget, 0);
  const actual = ytdCells.reduce((s, c) => s + c.actual, 0);
  const variance = actual - budget;
  const variance_pct = budget === 0 ? null : (variance / budget) * 100;
  return {
    month: ytdThrough, budget, actual, variance, variance_pct,
    color: colorVariance(variance_pct, thr),
  };
}

export async function buildBudgetVariance(opts: {
  projectId: number;
  fiscalYear: number;
  scenario: Scenario;
  ytdThrough?: number;
}): Promise<BudgetVarianceReport | null> {
  const sb = supabaseAdmin();
  const { projectId, fiscalYear, scenario } = opts;
  const ytdThrough = opts.ytdThrough ?? new Date().getUTCMonth() + 1;

  const { data: project } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: budget } = await sb
    .from('project_budgets')
    .select('id, status, start_month, scenario, fiscal_year')
    .eq('project_id', projectId)
    .eq('fiscal_year', fiscalYear)
    .eq('scenario', scenario)
    .maybeSingle();
  if (!budget) return null;
  const b = budget as { id: number; status: 'draft' | 'published'; start_month: number; scenario: Scenario; fiscal_year: number };

  const { data: segs } = await sb
    .from('project_budget_segments')
    .select('id, service_line, template_version')
    .eq('budget_id', b.id);
  const segments = (segs ?? []) as Array<{ id: number; service_line: ServiceLine; template_version: number }>;

  const segmentIds = segments.map(s => s.id);
  const { data: linesData } = segmentIds.length === 0
    ? { data: [] }
    : await sb
        .from('budget_lines')
        .select('segment_id, category, season, monthly_cost')
        .in('segment_id', segmentIds);
  const lines = (linesData ?? []) as Array<{
    segment_id: number; category: string; season: 'high' | 'low'; monthly_cost: number;
  }>;

  const { data: settings } = await sb.from('budget_settings').select('*').eq('id', 1).maybeSingle();
  const thr = {
    green: Number((settings as { green_pct?: number } | null)?.green_pct ?? 5),
    amber: Number((settings as { amber_pct?: number } | null)?.amber_pct ?? 15),
  };

  const fromDate = `${fiscalYear}-01-01`;
  const toDate   = `${fiscalYear}-12-31`;
  const { data: links } = await sb
    .from('odoo_move_line_analytics')
    .select('move_line_id')
    .eq('analytic_account_id', projectId);
  const moveLineIds = ((links ?? []) as Array<{ move_line_id: number }>).map(x => x.move_line_id);
  const { data: mlData } = moveLineIds.length === 0 ? { data: [] } : await sb
    .from('odoo_move_lines')
    .select('id, date, balance, odoo_accounts!inner(code)')
    .in('id', moveLineIds)
    .gte('date', fromDate)
    .lte('date', toDate);
  type MLRow = { id: number; date: string; balance: number; odoo_accounts: { code: string } };
  const moveLines = (mlData ?? []) as unknown as MLRow[];

  const segmentReports: SegmentVariance[] = [];
  let projUnmapped = 0;
  for (const seg of segments) {
    const tpl = getTemplate(seg.service_line, seg.template_version);
    const segLines = lines.filter(l => l.segment_id === seg.id);
    const budgetCells = aggregateBudgetByMonth(
      segLines, tpl.schema_json.season_months, b.start_month,
    );
    const segMoveLines = moveLines.map(ml => ({
      date: ml.date, balance: Number(ml.balance), account_code: ml.odoo_accounts.code,
    }));
    const { cells: actualCells, unmappedTotal } = aggregateActualsByMonth(
      segMoveLines, tpl.account_map_json, seg.id,
    );
    projUnmapped += unmappedTotal;
    const cells = computeCellRollup(budgetCells, actualCells, thr);

    const byCategory = new Map<string, VarianceCell[]>();
    for (const c of cells) {
      if (!byCategory.has(c.category)) byCategory.set(c.category, []);
      byCategory.get(c.category)!.push({
        month: c.month, budget: c.budget, actual: c.actual,
        variance: c.variance, variance_pct: c.variance_pct, color: c.color,
      });
    }
    const categories: CategoryVariance[] = [];
    for (const [cat, ccells] of byCategory.entries()) {
      categories.push({ category: cat, cells: ccells, ytd: sumCellsYtd(ccells, ytdThrough, thr) });
    }
    const segYtd = sumCellsYtd(cells.map(c => ({
      month: c.month, budget: c.budget, actual: c.actual,
      variance: c.variance, variance_pct: c.variance_pct, color: c.color,
    })), ytdThrough, thr);
    segmentReports.push({
      segment_id: seg.id, service_line: seg.service_line,
      template_version: seg.template_version, is_stub: tpl.is_stub,
      categories, ytd: segYtd,
    });
  }

  const allCells = segmentReports.flatMap(s => s.categories.flatMap(c => c.cells));
  const projYtd = sumCellsYtd(allCells, ytdThrough, thr);
  let weightedNum = 0, weightedDen = 0;
  for (const c of allCells) {
    if (c.variance_pct == null) continue;
    weightedNum += Math.abs(c.variance_pct) * c.budget;
    weightedDen += c.budget;
  }
  const health = weightedDen === 0 ? 0 : weightedNum / weightedDen;

  return {
    project_id: (project as { id: number }).id,
    project_name: (project as { name: string }).name,
    fiscal_year: b.fiscal_year,
    scenario: b.scenario,
    status: b.status,
    start_month: b.start_month,
    segments: segmentReports,
    ytd: projYtd,
    health_score_pct: health,
    unmapped_actuals_total: projUnmapped,
  };
}
