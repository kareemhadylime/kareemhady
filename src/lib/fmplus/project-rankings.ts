import { supabaseAdmin } from '../supabase';
import { classifyByPrefix, type AccountType } from './classifier';
import { planSlug } from './analytic-picker';

// Per-project P&L summary for the FMPLUS Projects view.
//
// Pulls every analytic-link in the period for FMPLUS, classifies each
// move-line through `classifyByPrefix` to assign it to revenue / COGS
// (matches the P&L tab's classification), then aggregates per analytic
// account to produce: revenue, COGS, gross profit, margin %.
//
// Used to render four ranking cards on the Projects tab:
//   1. Top Revenue           — top 10 by revenue
//   2. Best by Gross Profit  — top 10 by absolute GP
//   3. Best by Margin %      — top 10 by GP / Revenue (revenue > threshold)
//   4. Worst by Margin %     — bottom 10 by GP / Revenue (revenue > threshold)
//
// Activity-filtered: only projects with at least one revenue OR COGS line
// in the period appear. A project with only G&A or non-trading entries
// would have undefined margin and gets dropped from rankings.

export type ProjectRanking = {
  analytic_account_id: number;
  name: string;
  plan_id: number | null;
  plan_name: string | null;
  plan_slug: string | null;
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number | null;   // null when revenue ≤ 0
  line_count: number;
};

export type FmplusProjectRankings = {
  topRevenue:    ProjectRanking[];
  bestByGp:      ProjectRanking[];
  bestByMargin:  ProjectRanking[];
  worstByMargin: ProjectRanking[];
  totalProjects: number;
};

const TOP_N = 10;
// Margin rankings only consider projects with non-trivial revenue. 1,000 EGP
// is well below any operational FMPLUS project; it just filters tiny accruals
// that would otherwise dominate the rankings with anomalous margin %s.
const MARGIN_REVENUE_THRESHOLD = 1000;

export async function buildFmplusProjectRankings(args: {
  companyId: number;
  fromDate: string;
  toDate: string;
  /** Optional service-line slug filter — limits rankings to projects in
   *  that plan. When omitted, all FMPLUS plans are considered. */
  planSlug?: string;
  includeDrafts?: boolean;
}): Promise<FmplusProjectRankings> {
  const sb = supabaseAdmin();

  // Resolve plan filter (if any) → numeric plan_id
  const { data: plansData } = await sb.from('odoo_analytic_plans').select('id, name');
  const plans = (plansData || []) as Array<{ id: number; name: string }>;
  const planById = new Map(plans.map(p => [p.id, p]));
  const filterPlanId = args.planSlug
    ? plans.find(p => planSlug(p.name) === args.planSlug)?.id ?? null
    : null;

  // FMPLUS-scoped analytic accounts only. Without the `company_ids @>` filter
  // the rankings would mix in cross-tenant projects (Voltauto autos, Beithady
  // buildings) that share the same Odoo `analytic_accounts` table.
  const { data: aaData } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, plan_id')
    .contains('company_ids', [args.companyId]);
  const aaById = new Map<number, { id: number; name: string; plan_id: number | null }>();
  for (const a of (aaData || []) as Array<{ id: number; name: string; plan_id: number | null }>) {
    aaById.set(a.id, a);
  }

  // Pull move-line analytics + their classifying account info, paginated.
  // We need account.code/name/account_type for classifyByPrefix, so we join
  // through both odoo_move_lines (date/company/state filter) and
  // odoo_accounts (classifier inputs).
  type Row = {
    analytic_account_id: number;
    percentage: number;
    odoo_move_lines: {
      id: number;
      balance: number;
    } | null;
    // Inner join from move_lines to accounts isn't directly nestable here,
    // so we'll do a second query for account info keyed by account_id.
  };
  const states = args.includeDrafts ? ['draft', 'posted'] : ['posted'];

  // Step 1: pull analytic links scoped to FMPLUS + period.
  const links: Array<{
    analytic_account_id: number;
    move_line_id: number;
    percentage: number;
    balance: number;
  }> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('odoo_move_line_analytics')
      .select('analytic_account_id, move_line_id, percentage, odoo_move_lines!inner(id, balance, company_id, date, parent_state, account_id)')
      .eq('odoo_move_lines.company_id', args.companyId)
      .in('odoo_move_lines.parent_state', states)
      .gte('odoo_move_lines.date', args.fromDate)
      .lte('odoo_move_lines.date', args.toDate)
      .order('move_line_id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`buildFmplusProjectRankings (links): ${error.message}`);
    type LinkRow = {
      analytic_account_id: number;
      move_line_id: number;
      percentage: number;
      odoo_move_lines: { id: number; balance: number; account_id: number } | null;
    };
    const rows = (data || []) as unknown as LinkRow[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (!r.odoo_move_lines) continue;
      links.push({
        analytic_account_id: r.analytic_account_id,
        move_line_id: r.move_line_id,
        percentage: Number(r.percentage) || 100,
        balance: Number(r.odoo_move_lines.balance) || 0,
      });
    }
    if (rows.length < PAGE) break;
  }

  // Step 2: collect distinct move_line_ids and pull their account info.
  // Map from move_line_id → { code, name, account_type } so we can classify.
  const lineIds = Array.from(new Set(links.map(l => l.move_line_id)));
  const accountByLine = new Map<number, { code: string | null; name: string; account_type: string }>();
  // Pull move_lines.account_id for each line, then odoo_accounts info.
  // To avoid N queries, batch through .in('id', batch).
  const BATCH = 1000;
  for (let i = 0; i < lineIds.length; i += BATCH) {
    const slice = lineIds.slice(i, i + BATCH);
    const { data: mlRows, error: mlErr } = await sb
      .from('odoo_move_lines')
      .select('id, account_id, odoo_accounts!inner(code, name, account_type)')
      .in('id', slice);
    if (mlErr) throw new Error(`buildFmplusProjectRankings (move_lines): ${mlErr.message}`);
    type MlRow = { id: number; account_id: number; odoo_accounts: { code: string | null; name: string; account_type: string } | null };
    for (const r of (mlRows || []) as unknown as MlRow[]) {
      if (!r.odoo_accounts) continue;
      accountByLine.set(r.id, {
        code: r.odoo_accounts.code,
        name: r.odoo_accounts.name,
        account_type: r.odoo_accounts.account_type,
      });
    }
  }

  // Step 3: aggregate per analytic_account_id, splitting revenue vs. cogs
  // using the existing classifier so the rankings match the P&L tab exactly.
  type Agg = { rev: number; cogs: number; lines: number };
  const aggByAa = new Map<number, Agg>();

  for (const link of links) {
    const aa = aaById.get(link.analytic_account_id);
    if (!aa) continue;
    if (filterPlanId !== null && aa.plan_id !== filterPlanId) continue;

    const acct = accountByLine.get(link.move_line_id);
    if (!acct) continue;

    const cls = classifyByPrefix(acct.code || '', acct.name, acct.account_type as AccountType);
    if (!cls) continue;

    // Apportion the move-line's balance by the link's percentage.
    const portion = (link.balance * link.percentage) / 100;
    // Revenue is credit-normal: classifier says flip=true → display as positive.
    const display = cls.flip ? -portion : portion;

    const a = aggByAa.get(link.analytic_account_id) || { rev: 0, cogs: 0, lines: 0 };
    if (cls.section === 'revenue') {
      a.rev += display;
    } else if (cls.section === 'cost_of_revenue') {
      a.cogs += display;
    } else {
      // general_expenses + interest_tax_dep don't roll into project-level GP
      // since they're typically G&A / financing — skip.
    }
    a.lines += 1;
    aggByAa.set(link.analytic_account_id, a);
  }

  // Step 4: shape into ProjectRanking[]
  const projects: ProjectRanking[] = [];
  for (const [aaId, a] of aggByAa.entries()) {
    if (a.rev === 0 && a.cogs === 0) continue;  // no trading activity
    const aa = aaById.get(aaId)!;
    const planRow = aa.plan_id != null ? planById.get(aa.plan_id) : undefined;
    const gp = a.rev - a.cogs;
    const margin = a.rev > MARGIN_REVENUE_THRESHOLD ? (gp / a.rev) * 100 : null;
    projects.push({
      analytic_account_id: aaId,
      name: aa.name,
      plan_id: aa.plan_id,
      plan_name: planRow?.name ?? null,
      plan_slug: planRow ? planSlug(planRow.name) : null,
      revenue: a.rev,
      cogs: a.cogs,
      gross_profit: gp,
      margin_pct: margin,
      line_count: a.lines,
    });
  }

  // Step 5: rank
  const byRevenue = [...projects].sort((a, b) => b.revenue - a.revenue);
  const byGp      = [...projects].sort((a, b) => b.gross_profit - a.gross_profit);
  const withMargin = projects.filter(p => p.margin_pct != null);
  const byMarginDesc = [...withMargin].sort((a, b) => (b.margin_pct ?? -Infinity) - (a.margin_pct ?? -Infinity));
  const byMarginAsc  = [...withMargin].sort((a, b) => (a.margin_pct ?? Infinity) - (b.margin_pct ?? Infinity));

  return {
    topRevenue:    byRevenue.slice(0, TOP_N),
    bestByGp:      byGp.slice(0, TOP_N),
    bestByMargin:  byMarginDesc.slice(0, TOP_N),
    worstByMargin: byMarginAsc.slice(0, TOP_N),
    totalProjects: projects.length,
  };
}
