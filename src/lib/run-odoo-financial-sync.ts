import { supabaseAdmin } from './supabase';
import {
  odooSearchRead,
  type OdooAccount,
  type OdooPartner,
  type OdooMoveLine,
} from './odoo';
import { cutoffDate } from './run-odoo-sync';

// Scope for financial reporting (Beithady Financials rule):
//   5  = Beithady Hospitality - (EGYPT)
//   10 = Beithady Hospitality FZCO - (Dubai)
// A1HOSPITALITY (id 4) is out of this scope per the Feb 2026 xlsx Filters
// sheet + user direction.
export const FINANCIALS_COMPANY_IDS = [5, 10];

// Prefix for Home Owner Cut accounts — post-sync flag flips is_owner=true
// for any partner who has ever had a line hitting this prefix.
const OWNER_ACCOUNT_CODE_PREFIX = '504';

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

export async function syncOdooMoveLines(companyId: number) {
  if (!FINANCIALS_COMPANY_IDS.includes(companyId)) {
    return { ok: false, error: `company ${companyId} is out of Financials scope` };
  }
  const sb = supabaseAdmin();
  const started = Date.now();
  const ctx = { allowed_company_ids: [companyId] };
  const domain = [
    ['company_id', '=', companyId],
    ['parent_state', 'in', ['draft', 'posted']],
    ['date', '>=', cutoffDate()],
  ];

  const PAGE = 500;
  let offset = 0;
  let synced = 0;
  while (true) {
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
    }
    synced += batch.length;

    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  return {
    ok: true,
    company_id: companyId,
    move_lines_synced: synced,
    duration_ms: Date.now() - started,
  };
}

export async function finalizeOwnerFlag() {
  const sb = supabaseAdmin();
  const started = Date.now();
  // Flip is_owner=true for every partner that appears on any 504xxx line.
  // Implemented as two round-trips because supabase-js doesn't support a
  // single-query correlated-update.
  const { data: ownerPartnerRows } = await sb
    .from('odoo_move_lines')
    .select('partner_id, odoo_accounts!inner(code)')
    .not('partner_id', 'is', null)
    .like('odoo_accounts.code', `${OWNER_ACCOUNT_CODE_PREFIX}%`);
  const ownerIds = Array.from(
    new Set(
      (ownerPartnerRows || [])
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
