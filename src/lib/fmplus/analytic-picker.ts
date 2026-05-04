import { supabaseAdmin } from '../supabase';

// FMPLUS analytic-account picker data layer.
//
// Two-level hierarchy:
//   1. Plan (service line) — odoo_analytic_plans. FMPLUS has 4:
//        HK Projects, MEP Projects, Mix Projects, Security Projects
//   2. Project (analytic account) — odoo_analytic_accounts.
//        Real client/site projects (Marassi Residential, AUC, RATP Stations…).
//
// "Activity in period" = at least one move-line on `odoo_move_line_analytics`
// for that analytic account, joined to a move-line whose date falls in the
// requested period and whose company_id = FMPLUS. Accounts without activity
// are filtered out per user requirement — no empty buttons in the picker.

export type FmplusPlan = {
  id: number;
  name: string;
  /** Stable URL-safe slug derived from the plan name (e.g. "HK Projects" → "hk"). */
  slug: string;
  project_count: number;       // total projects under this plan (synced)
  active_count: number;         // projects WITH activity in the period
};

export type FmplusProject = {
  id: number;
  name: string;
  plan_id: number;
  plan_slug: string;
  /** Whether this project has any move-line activity in the requested period. */
  active: boolean;
};

/** Slug-ify a plan name. "HK Projects" → "hk", "Mix Projects" → "mix". */
export function planSlug(name: string): string {
  const m = name.match(/^([A-Za-z]+)/);
  return (m?.[1] ?? name).toLowerCase();
}

/**
 * Fetch FMPLUS plans + project counts (total + active in period).
 * Plans returned in canonical service-line order: HK, MEP, Mix, Security,
 * then any others alphabetical.
 */
export async function listFmplusPlansWithActivity(args: {
  companyId: number;
  fromDate: string;     // inclusive YYYY-MM-DD
  toDate: string;       // inclusive YYYY-MM-DD
}): Promise<FmplusPlan[]> {
  const sb = supabaseAdmin();

  // Plans
  const { data: plansData, error: plansErr } = await sb
    .from('odoo_analytic_plans')
    .select('id, name');
  if (plansErr) throw new Error(`listFmplusPlansWithActivity (plans): ${plansErr.message}`);
  const plans = (plansData || []) as Array<{ id: number; name: string }>;

  // Projects (all, scoped to FMPLUS active company set)
  const { data: aaData, error: aaErr } = await sb
    .from('odoo_analytic_accounts')
    .select('id, plan_id, active');
  if (aaErr) throw new Error(`listFmplusPlansWithActivity (aa): ${aaErr.message}`);
  const aa = (aaData || []) as Array<{ id: number; plan_id: number | null; active: boolean | null }>;

  // Active project IDs (with at least one analytic-link to a move-line in
  // period). The link table maps move_line_id ↔ analytic_account_id; we
  // join through odoo_move_lines for date + company filter.
  const activeIds = await getActiveAccountIds({
    companyId: args.companyId,
    fromDate: args.fromDate,
    toDate: args.toDate,
  });

  const totalByPlan = new Map<number, number>();
  const activeByPlan = new Map<number, number>();
  for (const a of aa) {
    if (a.plan_id == null) continue;
    if (a.active === false) continue;
    totalByPlan.set(a.plan_id, (totalByPlan.get(a.plan_id) || 0) + 1);
    if (activeIds.has(a.id)) {
      activeByPlan.set(a.plan_id, (activeByPlan.get(a.plan_id) || 0) + 1);
    }
  }

  const PLAN_ORDER = ['hk', 'mep', 'mix', 'security'];
  const out: FmplusPlan[] = plans.map(p => ({
    id: p.id,
    name: p.name,
    slug: planSlug(p.name),
    project_count: totalByPlan.get(p.id) || 0,
    active_count: activeByPlan.get(p.id) || 0,
  }));
  // Filter out plans with NO active projects in period (zero-state hide)
  // — but always keep the canonical 4 even if currently empty so the UI
  // never appears to "lose" service lines. Easiest: keep all known plans.
  out.sort((a, b) => {
    const ai = PLAN_ORDER.indexOf(a.slug);
    const bi = PLAN_ORDER.indexOf(b.slug);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Fetch all FMPLUS projects under a given plan, with an `active` flag based
 * on whether the project has any move-line activity in the period. Caller
 * filters as desired.
 */
export async function listFmplusProjectsWithActivity(args: {
  companyId: number;
  fromDate: string;
  toDate: string;
  planSlug: string;     // 'hk' | 'mep' | 'mix' | 'security' | ...
}): Promise<FmplusProject[]> {
  const sb = supabaseAdmin();

  // Resolve the plan id
  const { data: plansData } = await sb
    .from('odoo_analytic_plans')
    .select('id, name');
  const plans = (plansData || []) as Array<{ id: number; name: string }>;
  const plan = plans.find(p => planSlug(p.name) === args.planSlug);
  if (!plan) return [];

  const { data, error } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, plan_id, active')
    .eq('plan_id', plan.id)
    .order('name');
  if (error) throw new Error(`listFmplusProjectsWithActivity: ${error.message}`);
  const all = (data || []) as Array<{ id: number; name: string; plan_id: number; active: boolean | null }>;

  const activeIds = await getActiveAccountIds({
    companyId: args.companyId,
    fromDate: args.fromDate,
    toDate: args.toDate,
  });

  return all
    .filter(p => p.active !== false)
    .map(p => ({
      id: p.id,
      name: p.name,
      plan_id: p.plan_id,
      plan_slug: args.planSlug,
      active: activeIds.has(p.id),
    }));
}

/**
 * Internal: returns the SET of analytic_account_ids that have ≥1 move-line
 * inside the requested period for the given company.
 *
 * Implementation: query `odoo_move_line_analytics` joined to
 * `odoo_move_lines` and pull distinct analytic_account_id values. Paginated
 * with id-ordering for stable .range() pagination.
 */
async function getActiveAccountIds(args: {
  companyId: number;
  fromDate: string;
  toDate: string;
}): Promise<Set<number>> {
  const sb = supabaseAdmin();
  const out = new Set<number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('odoo_move_line_analytics')
      .select('analytic_account_id, odoo_move_lines!inner(company_id, date, parent_state)')
      .eq('odoo_move_lines.company_id', args.companyId)
      .in('odoo_move_lines.parent_state', ['draft', 'posted'])
      .gte('odoo_move_lines.date', args.fromDate)
      .lte('odoo_move_lines.date', args.toDate)
      .order('analytic_account_id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`getActiveAccountIds: ${error.message}`);
    const rows = (data || []) as Array<{ analytic_account_id: number }>;
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.analytic_account_id != null) out.add(Number(r.analytic_account_id));
    }
    if (rows.length < PAGE) break;
  }
  return out;
}
