import { supabaseAdmin } from './supabase';
import {
  odooSearchRead,
  type OdooAccount,
  type OdooPartner,
  type OdooMoveLine,
  type OdooAnalyticAccount,
  type OdooAnalyticPlan,
} from './odoo';
import { cutoffDate } from './run-odoo-sync';

// Scope for financial reporting. Phase 7.5 adds A1HOSPITALITY since the
// user wants per-company views including A1 as BH-435's owner.
//   4  = A1HOSPITALITY (BH-435 owner; Lime 50% stake)
//   5  = Beithady Hospitality - (EGYPT)
//   10 = Beithady Hospitality FZCO - (Dubai)
export const FINANCIALS_COMPANY_IDS = [4, 5, 10];

// "Home Owner Cut" detection. The tenant's CoA does NOT use 504xxx codes
// as the Feb 2026 xlsx suggested — the account is named "Home Owner Cut"
// (with sibling "Rent Costs") under expense_direct_cost. We match by name.
const OWNER_NAME_PATTERN = '%home owner%';
const OWNER_RENT_NAME_PATTERN = '%rent cost%';

// Each phase targets < 200s to stay comfortably under Vercel's 300s cap.
// The move-lines phase runs per company so neither Egypt (~12k lines) nor
// Dubai (~6k) exceeds the limit.

export async function syncOdooAccounts() {
  const sb = supabaseAdmin();
  const started = Date.now();
  const accountsById = new Map<
    number,
    OdooAccount & { _companies: Set<number> }
  >();
  for (const companyId of FINANCIALS_COMPANY_IDS) {
    const ctx = { allowed_company_ids: [companyId] };
    let offset = 0;
    while (true) {
      const batch = await odooSearchRead<OdooAccount>(
        'account.account',
        [],
        {
          fields: ['code', 'name', 'account_type'],
          limit: 500,
          offset,
          order: 'code asc, id asc',
          context: ctx,
        }
      );
      if (batch.length === 0) break;
      for (const a of batch) {
        const existing = accountsById.get(a.id);
        if (existing) existing._companies.add(companyId);
        else
          accountsById.set(a.id, {
            ...a,
            _companies: new Set([companyId]),
          });
      }
      if (batch.length < 500) break;
      offset += 500;
    }
  }

  const rows = Array.from(accountsById.values()).map(a => ({
    id: a.id,
    code: typeof a.code === 'string' ? a.code : null,
    name: a.name || '',
    account_type: a.account_type || null,
    company_ids: Array.from(a._companies),
    last_synced_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await sb
      .from('odoo_accounts')
      .upsert(rows.slice(i, i + 500), { onConflict: 'id' });
  }
  return { ok: true, accounts_synced: rows.length, duration_ms: Date.now() - started };
}

export async function syncOdooPartners() {
  const sb = supabaseAdmin();
  const started = Date.now();
  const partnersById = new Map<
    number,
    OdooPartner & { _isEmployee: boolean }
  >();
  for (const companyId of FINANCIALS_COMPANY_IDS) {
    const ctx = { allowed_company_ids: [companyId] };
    let offset = 0;
    while (true) {
      const batch = await odooSearchRead<OdooPartner>(
        'res.partner',
        [
          '|',
          ['supplier_rank', '>', 0],
          ['customer_rank', '>', 0],
        ],
        {
          fields: [
            'name',
            'email',
            'phone',
            'is_company',
            'active',
            'supplier_rank',
            'customer_rank',
            'category_id',
          ],
          limit: 500,
          offset,
          order: 'id asc',
          context: ctx,
        }
      );
      if (batch.length === 0) break;
      for (const p of batch) {
        const existing = partnersById.get(p.id);
        if (existing) {
          existing.supplier_rank = Math.max(
            existing.supplier_rank || 0,
            p.supplier_rank || 0
          );
          existing.customer_rank = Math.max(
            existing.customer_rank || 0,
            p.customer_rank || 0
          );
        } else {
          partnersById.set(p.id, { ...p, _isEmployee: false });
        }
      }
      if (batch.length < 500) break;
      offset += 500;
    }
  }

  // Employee linkage: hr.employee → res.partner via work_contact_id or
  // user_partner_id. Non-fatal if HR module isn't installed.
  try {
    const employees = await odooSearchRead<{
      id: number;
      work_contact_id?: [number, string] | false;
      user_partner_id?: [number, string] | false;
    }>(
      'hr.employee',
      [],
      {
        fields: ['work_contact_id', 'user_partner_id'],
        limit: 2000,
        context: { allowed_company_ids: FINANCIALS_COMPANY_IDS },
      }
    );
    for (const e of employees) {
      const linkedId = Array.isArray(e.work_contact_id)
        ? e.work_contact_id[0]
        : Array.isArray(e.user_partner_id)
          ? e.user_partner_id[0]
          : null;
      if (linkedId && partnersById.has(linkedId)) {
        partnersById.get(linkedId)!._isEmployee = true;
      }
    }
  } catch {
    // HR module absent or insufficient rights — not fatal.
  }

  const rows = Array.from(partnersById.values()).map(p => ({
    id: p.id,
    name: p.name || '',
    email: typeof p.email === 'string' ? p.email : null,
    phone: typeof p.phone === 'string' ? p.phone : null,
    is_company: p.is_company ?? null,
    active: p.active ?? null,
    supplier_rank: p.supplier_rank || 0,
    customer_rank: p.customer_rank || 0,
    is_employee: p._isEmployee,
    is_owner: false,
    category_ids: Array.isArray(p.category_id) ? p.category_id : [],
    last_synced_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await sb
      .from('odoo_partners')
      .upsert(rows.slice(i, i + 500), { onConflict: 'id' });
  }
  return { ok: true, partners_synced: rows.length, duration_ms: Date.now() - started };
}

export async function syncOdooMoveLines(
  companyId: number,
  options: { resume?: boolean; timeBudgetMs?: number } = {}
) {
  if (!FINANCIALS_COMPANY_IDS.includes(companyId)) {
    return { ok: false, error: `company ${companyId} is out of Financials scope` };
  }
  const sb = supabaseAdmin();
  const started = Date.now();
  // Vercel caps functions at 300s. Leave ~30s headroom to flush last batch
  // + return cleanly. Callers can override via timeBudgetMs.
  const budgetMs = options.timeBudgetMs ?? 260_000;
  const ctx = { allowed_company_ids: [companyId] };
  const today = new Date().toISOString().slice(0, 10);

  // Resume-from-last-synced-id: if resume is true, start from the max id
  // already in Supabase for this company. This lets callers invoke the
  // endpoint repeatedly until complete=true without re-fetching rows
  // that already landed. Odoo IDs are strictly ascending on account.move.line,
  // so this is safe for backfill (updates to old rows require a separate
  // refresh pass — Phase 7.4 concern).
  let startAfterId = 0;
  if (options.resume) {
    const { data: maxRow } = await sb
      .from('odoo_move_lines')
      .select('id')
      .eq('company_id', companyId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRow?.id) startAfterId = Number(maxRow.id);
  }

  const domain: unknown[] = [
    ['company_id', '=', companyId],
    ['parent_state', 'in', ['draft', 'posted']],
    ['date', '>=', cutoffDate()],
    ['date', '<=', today],
  ];
  if (startAfterId > 0) {
    domain.push(['id', '>', startAfterId]);
  }

  const PAGE = 500;
  let offset = 0;
  let synced = 0;
  let lastId = startAfterId;
  let hitTimeBudget = false;

  while (true) {
    if (Date.now() - started > budgetMs) {
      hitTimeBudget = true;
      break;
    }

    const batch = await odooSearchRead<OdooMoveLine>(
      'account.move.line',
      domain,
      {
        fields: [
          'move_id',
          'company_id',
          'account_id',
          'partner_id',
          'date',
          'name',
          'debit',
          'credit',
          'balance',
          'amount_residual',
          'currency_id',
          'amount_currency',
          'analytic_distribution',
          'parent_state',
          'move_type',
          'reconciled',
        ],
        limit: PAGE,
        offset,
        order: 'id asc',
        context: ctx,
      }
    );
    if (batch.length === 0) break;

    const rows = batch
      .filter(m => Array.isArray(m.move_id))
      .map(m => ({
        id: m.id,
        move_id: Array.isArray(m.move_id) ? m.move_id[0] : 0,
        company_id: companyId,
        account_id: Array.isArray(m.account_id) ? m.account_id[0] : null,
        partner_id: Array.isArray(m.partner_id) ? m.partner_id[0] : null,
        date: typeof m.date === 'string' ? m.date : null,
        name: typeof m.name === 'string' ? m.name : null,
        debit: Number(m.debit) || 0,
        credit: Number(m.credit) || 0,
        balance: Number(m.balance) || 0,
        amount_residual: Number(m.amount_residual) || 0,
        currency: Array.isArray(m.currency_id) ? m.currency_id[1] : null,
        amount_currency:
          typeof m.amount_currency === 'number' ? m.amount_currency : null,
        analytic_distribution:
          m.analytic_distribution && typeof m.analytic_distribution === 'object'
            ? m.analytic_distribution
            : null,
        parent_state: m.parent_state || null,
        move_type: m.move_type || null,
        reconciled: !!m.reconciled,
        synced_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        await sb
          .from('odoo_move_lines')
          .upsert(rows.slice(i, i + 500), { onConflict: 'id' });
      }
      lastId = rows[rows.length - 1].id;
    }
    synced += batch.length;

    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  const complete = !hitTimeBudget;
  return {
    ok: true,
    company_id: companyId,
    move_lines_synced: synced,
    last_id: lastId,
    complete,
    resume_hint: complete
      ? null
      : `call again with ?phase=move-lines&company=${companyId}&resume=1`,
    duration_ms: Date.now() - started,
  };
}

// Extract a building code like "BH-26" / "BH-73" / "BH-435" from an analytic
// account name. Returns null if no such prefix is present.
function extractBuildingCode(name: string): string | null {
  // Accept "BH-26 Lotus", "BH 26", "BH26 …", "Beit Hady 26". Normalise to BH-NN.
  const m =
    /\b(?:BH|Beit\s*Hady)[\s\-]*(\d{2,3}[A-Z]?)\b/i.exec(name) ||
    /\bBH-?(\d{2,3}[A-Z]?)/i.exec(name);
  if (!m) return null;
  return `BH-${m[1].toUpperCase()}`;
}

// Arbitrage vs Management classification by name pattern.
function extractLobLabel(
  accountName: string,
  planName: string | null
): string | null {
  const combined = `${accountName} ${planName || ''}`.toLowerCase();
  if (/arbitrage|leased/.test(combined)) return 'Arbitrage';
  if (/management|manage|mgmt/.test(combined)) return 'Management';
  return null;
}

export async function syncOdooAnalyticPlans() {
  const sb = supabaseAdmin();
  const started = Date.now();
  const byId = new Map<
    number,
    OdooAnalyticPlan & { _companies: Set<number> }
  >();
  for (const companyId of FINANCIALS_COMPANY_IDS) {
    const ctx = { allowed_company_ids: [companyId] };
    let offset = 0;
    while (true) {
      const batch = await odooSearchRead<OdooAnalyticPlan>(
        'account.analytic.plan',
        [],
        {
          fields: ['name', 'parent_id', 'company_id'],
          limit: 200,
          offset,
          context: ctx,
        }
      );
      if (batch.length === 0) break;
      for (const p of batch) {
        const existing = byId.get(p.id);
        if (existing) existing._companies.add(companyId);
        else byId.set(p.id, { ...p, _companies: new Set([companyId]) });
      }
      if (batch.length < 200) break;
      offset += 200;
    }
  }
  const rows = Array.from(byId.values()).map(p => ({
    id: p.id,
    name: p.name || '',
    parent_plan_id: Array.isArray(p.parent_id) ? p.parent_id[0] : null,
    company_ids: Array.from(p._companies),
    last_synced_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      await sb
        .from('odoo_analytic_plans')
        .upsert(rows.slice(i, i + 500), { onConflict: 'id' });
    }
  }
  return {
    ok: true,
    analytic_plans_synced: rows.length,
    duration_ms: Date.now() - started,
  };
}

export async function syncOdooAnalyticAccounts() {
  const sb = supabaseAdmin();
  const started = Date.now();
  // Build a plan_id → plan_name map once so classification can use it.
  const { data: plans } = await sb.from('odoo_analytic_plans').select('id, name');
  const planNameById = new Map<number, string>(
    (plans || []).map(r => [
      Number((r as { id: number }).id),
      String((r as { name: string }).name || ''),
    ])
  );

  const byId = new Map<
    number,
    OdooAnalyticAccount & { _companies: Set<number> }
  >();
  for (const companyId of FINANCIALS_COMPANY_IDS) {
    const ctx = { allowed_company_ids: [companyId] };
    let offset = 0;
    while (true) {
      const batch = await odooSearchRead<OdooAnalyticAccount>(
        'account.analytic.account',
        [],
        {
          fields: [
            'name',
            'code',
            'plan_id',
            'root_plan_id',
            'company_id',
            'active',
          ],
          limit: 500,
          offset,
          order: 'id asc',
          context: ctx,
        }
      );
      if (batch.length === 0) break;
      for (const a of batch) {
        const existing = byId.get(a.id);
        if (existing) existing._companies.add(companyId);
        else byId.set(a.id, { ...a, _companies: new Set([companyId]) });
      }
      if (batch.length < 500) break;
      offset += 500;
    }
  }

  const rows = Array.from(byId.values()).map(a => {
    const planId = Array.isArray(a.plan_id) ? a.plan_id[0] : null;
    const rootPlanId = Array.isArray(a.root_plan_id) ? a.root_plan_id[0] : planId;
    const planName = planId != null ? planNameById.get(planId) || null : null;
    const name = a.name || '';
    return {
      id: a.id,
      name,
      code: typeof a.code === 'string' ? a.code : null,
      plan_id: planId,
      root_plan_id: rootPlanId,
      company_ids: Array.from(a._companies),
      active: a.active ?? true,
      building_code: extractBuildingCode(name),
      lob_label: extractLobLabel(name, planName),
      last_synced_at: new Date().toISOString(),
    };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      await sb
        .from('odoo_analytic_accounts')
        .upsert(rows.slice(i, i + 500), { onConflict: 'id' });
    }
  }
  return {
    ok: true,
    analytic_accounts_synced: rows.length,
    duration_ms: Date.now() - started,
  };
}

// Rebuild odoo_move_line_analytics from the analytic_distribution jsonb
// on odoo_move_lines. This is a pure in-DB projection pass — no Odoo
// fetch needed. Can be called any time after move-lines are synced.
export async function rebuildAnalyticLinks() {
  const sb = supabaseAdmin();
  const started = Date.now();

  // Truncate is cheapest vs merge for a projection; the FK from move_lines
  // preserves integrity. Use a delete-all to avoid DDL privileges.
  await sb.from('odoo_move_line_analytics').delete().neq('move_line_id', 0);

  // Page through move_lines with non-empty analytic_distribution and expand
  // the jsonb keys (comma-separated => multiple account ids).
  const PAGE = 2000;
  let offset = 0;
  let links = 0;
  while (true) {
    const { data, error } = await sb
      .from('odoo_move_lines')
      .select('id, analytic_distribution')
      .not('analytic_distribution', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`rebuildAnalyticLinks: ${error.message}`);
    const rows = (data as Array<{
      id: number;
      analytic_distribution: Record<string, number> | null;
    }>) || [];
    if (rows.length === 0) break;

    const inserts: Array<{
      move_line_id: number;
      analytic_account_id: number;
      percentage: number;
    }> = [];
    for (const r of rows) {
      if (!r.analytic_distribution) continue;
      for (const [keyComposite, pct] of Object.entries(r.analytic_distribution)) {
        const ids = keyComposite.split(',').map(s => parseInt(s.trim(), 10));
        for (const id of ids) {
          if (Number.isFinite(id)) {
            inserts.push({
              move_line_id: r.id,
              analytic_account_id: id,
              percentage: Number(pct) || 100,
            });
          }
        }
      }
    }

    // Dedupe within this batch (rare but possible if same id appears twice)
    const seen = new Set<string>();
    const unique = inserts.filter(i => {
      const k = `${i.move_line_id}:${i.analytic_account_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (unique.length > 0) {
      for (let i = 0; i < unique.length; i += 1000) {
        await sb
          .from('odoo_move_line_analytics')
          .upsert(unique.slice(i, i + 1000), {
            onConflict: 'move_line_id,analytic_account_id',
          });
      }
      links += unique.length;
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  return {
    ok: true,
    analytic_links_synced: links,
    duration_ms: Date.now() - started,
  };
}

export async function finalizeOwnerFlag() {
  const sb = supabaseAdmin();
  const started = Date.now();
  // Owner partners = anyone who appears on a move line hitting an account
  // named "Home Owner Cut" or "Rent Costs". We match by name (not code)
  // because the tenant's CoA has "Home Owner Cut" at 500103 in some
  // companies and other codes entirely elsewhere — see
  // memory/beithady_intercompany_model.md.
  const { data: rows } = await sb
    .from('odoo_move_lines')
    .select('partner_id, odoo_accounts!inner(name)')
    .not('partner_id', 'is', null)
    .or(
      `name.ilike.${OWNER_NAME_PATTERN},name.ilike.${OWNER_RENT_NAME_PATTERN}`,
      { foreignTable: 'odoo_accounts' }
    );
  const ownerIds = Array.from(
    new Set(
      (rows || [])
        .map(r => (r as { partner_id: number | null }).partner_id)
        .filter((id): id is number => typeof id === 'number')
    )
  );
  if (ownerIds.length > 0) {
    await sb.from('odoo_partners').update({ is_owner: true }).in('id', ownerIds);
  }
  return {
    ok: true,
    owners_flagged: ownerIds.length,
    duration_ms: Date.now() - started,
  };
}
