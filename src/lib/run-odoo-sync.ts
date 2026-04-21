import { supabaseAdmin } from './supabase';
import {
  odooSearchRead,
  type OdooCompany,
  type OdooInvoice,
  type OdooAccount,
  type OdooPartner,
  type OdooMoveLine,
} from './odoo';

// Beithady finance scope. A1HOSPITALITY is retained in the invoice backfill
// for a future BH-435 owner-side view but EXCLUDED from the consolidated
// Financials rule — see memory/beithady_intercompany_model.md.
//   4  = A1HOSPITALITY (BH-435 owner; Lime 50% stake)
//   5  = Beithady Hospitality - (EGYPT)
//   10 = Beithady Hospitality FZCO - (Dubai)
const SCOPE_COMPANY_IDS = [4, 5, 10];

// Scope used for accounts / move lines / partners — Phase 7.2. The Feb 2026
// Consolidated P&L xlsx Filters sheet specifies Companies = {Dubai, Egypt}
// only. A1HOSPITALITY is its own world and is handled separately later.
const FINANCIALS_COMPANY_IDS = [5, 10];

// Account code prefix for "Home Owner Cut" — post-sync classification tags
// any partner who ever has a line hitting 504xxx as an owner.
const OWNER_ACCOUNT_CODE_PREFIX = '504';

const BACKFILL_DAYS = 365;
const PAGE_SIZE = 200;
const MOVE_LINE_PAGE_SIZE = 500;

function cutoffDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - BACKFILL_DAYS);
  return d.toISOString().slice(0, 10);
}

type OdooInvoiceReadRow = OdooInvoice & {
  create_date?: string | false;
  write_date?: string | false;
};

export async function runOdooSync(trigger: 'cron' | 'manual') {
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('odoo_sync_runs')
    .insert({ trigger, status: 'running' })
    .select()
    .single();
  if (runErr || !run) {
    return { ok: false, error: 'failed_to_open_run', details: runErr };
  }

  let companiesSynced = 0;
  let invoicesSynced = 0;
  let accountsSynced = 0;
  let partnersSynced = 0;
  let moveLinesSynced = 0;

  try {
    for (const companyId of SCOPE_COMPANY_IDS) {
      const ctx = { allowed_company_ids: [companyId] };

      // 1. Company record — upsert with in_scope=true.
      const companyRows = await odooSearchRead<OdooCompany>(
        'res.company',
        [['id', '=', companyId]],
        {
          fields: ['name', 'country_id', 'currency_id'],
          limit: 1,
          context: ctx,
        }
      );
      const company = companyRows[0];
      if (!company) continue;

      await sb.from('odoo_companies').upsert(
        {
          id: company.id,
          name: company.name || '',
          country: Array.isArray(company.country_id)
            ? company.country_id[1]
            : null,
          currency: Array.isArray(company.currency_id)
            ? company.currency_id[1]
            : null,
          in_scope: true,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      companiesSynced++;

      // 2. Invoices — paginated. Filter: posted customer/vendor invoices +
      // refunds (out_refund/in_refund) in the backfill window.
      const domain = [
        [
          'move_type',
          'in',
          ['out_invoice', 'in_invoice', 'out_refund', 'in_refund'],
        ],
        ['state', '=', 'posted'],
        ['invoice_date', '>=', cutoffDate()],
        ['company_id', '=', companyId],
      ];

      let offset = 0;
      while (true) {
        const batch = await odooSearchRead<OdooInvoiceReadRow>(
          'account.move',
          domain,
          {
            fields: [
              'name',
              'move_type',
              'state',
              'company_id',
              'partner_id',
              'invoice_date',
              'amount_total',
              'currency_id',
              'create_date',
              'write_date',
            ],
            limit: PAGE_SIZE,
            offset,
            order: 'id asc',
            context: ctx,
          }
        );
        if (batch.length === 0) break;

        const rows = batch.map(i => ({
          id: i.id,
          name: typeof i.name === 'string' ? i.name : null,
          move_type: i.move_type || 'unknown',
          state: i.state || 'unknown',
          company_id: companyId,
          partner_id: Array.isArray(i.partner_id) ? i.partner_id[0] : null,
          partner_name: Array.isArray(i.partner_id) ? i.partner_id[1] : null,
          invoice_date:
            typeof i.invoice_date === 'string' ? i.invoice_date : null,
          amount_total:
            typeof i.amount_total === 'number' ? i.amount_total : null,
          currency: Array.isArray(i.currency_id) ? i.currency_id[1] : null,
          odoo_created_at:
            typeof i.create_date === 'string' ? i.create_date : null,
          odoo_updated_at:
            typeof i.write_date === 'string' ? i.write_date : null,
          synced_at: new Date().toISOString(),
        }));

        await sb.from('odoo_invoices').upsert(rows, { onConflict: 'id' });
        invoicesSynced += batch.length;

        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    // --- Phase 7.2: chart of accounts, partners, move lines ---
    // Scope: Financials companies only (5 + 10). A1HOSPITALITY excluded per
    // the Feb 2026 xlsx Filters sheet + user direction.

    // 3. Chart of accounts. Pulled once per scope company and deduped —
    // accounts can be shared or company-specific in Odoo 17+. We track which
    // companies an account belongs to in company_ids[].
    const accountsById = new Map<
      number,
      OdooAccount & { _companies: Set<number> }
    >();
    for (const companyId of FINANCIALS_COMPANY_IDS) {
      const ctx = { allowed_company_ids: [companyId] };
      let accOffset = 0;
      while (true) {
        const accBatch = await odooSearchRead<OdooAccount>(
          'account.account',
          [],
          {
            fields: ['code', 'name', 'account_type'],
            limit: 500,
            offset: accOffset,
            order: 'code asc, id asc',
            context: ctx,
          }
        );
        if (accBatch.length === 0) break;
        for (const a of accBatch) {
          const existing = accountsById.get(a.id);
          if (existing) {
            existing._companies.add(companyId);
          } else {
            accountsById.set(a.id, {
              ...a,
              _companies: new Set([companyId]),
            });
          }
        }
        if (accBatch.length < 500) break;
        accOffset += 500;
      }
    }
    const accountRows = Array.from(accountsById.values()).map(a => ({
      id: a.id,
      code: typeof a.code === 'string' ? a.code : null,
      name: a.name || '',
      account_type: a.account_type || null,
      company_ids: Array.from(a._companies),
      last_synced_at: new Date().toISOString(),
    }));
    if (accountRows.length > 0) {
      // Upsert in chunks — supabase-js has a payload size limit.
      for (let i = 0; i < accountRows.length; i += 500) {
        await sb
          .from('odoo_accounts')
          .upsert(accountRows.slice(i, i + 500), { onConflict: 'id' });
      }
    }
    accountsSynced = accountRows.length;

    // 4. Partners. Pull any partner with supplier/customer rank > 0 across
    // the scope — plus we'll add is_employee and is_owner flags after we've
    // loaded move lines (owner detection needs line data).
    const partnersById = new Map<
      number,
      OdooPartner & { _isEmployee: boolean }
    >();
    for (const companyId of FINANCIALS_COMPANY_IDS) {
      const ctx = { allowed_company_ids: [companyId] };
      let pOffset = 0;
      while (true) {
        const pBatch = await odooSearchRead<OdooPartner>(
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
            offset: pOffset,
            order: 'id asc',
            context: ctx,
          }
        );
        if (pBatch.length === 0) break;
        for (const p of pBatch) {
          const existing = partnersById.get(p.id);
          if (existing) {
            // Preserve the max rank across company contexts.
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
        if (pBatch.length < 500) break;
        pOffset += 500;
      }
    }

    // 4b. Employee detection — try hr.employee; if the HR module isn't
    // enabled or the user lacks access, skip silently.
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

    const partnerRows = Array.from(partnersById.values()).map(p => ({
      id: p.id,
      name: p.name || '',
      email: typeof p.email === 'string' ? p.email : null,
      phone: typeof p.phone === 'string' ? p.phone : null,
      is_company: p.is_company ?? null,
      active: p.active ?? null,
      supplier_rank: p.supplier_rank || 0,
      customer_rank: p.customer_rank || 0,
      is_employee: p._isEmployee,
      is_owner: false, // populated after move lines sync
      category_ids: Array.isArray(p.category_id) ? p.category_id : [],
      last_synced_at: new Date().toISOString(),
    }));
    if (partnerRows.length > 0) {
      for (let i = 0; i < partnerRows.length; i += 500) {
        await sb
          .from('odoo_partners')
          .upsert(partnerRows.slice(i, i + 500), { onConflict: 'id' });
      }
    }
    partnersSynced = partnerRows.length;

    // 5. Move lines. Include drafts per xlsx Filters "With Draft Entries".
    const moveLineDomain = [
      ['company_id', 'in', FINANCIALS_COMPANY_IDS],
      ['parent_state', 'in', ['draft', 'posted']],
      ['date', '>=', cutoffDate()],
    ];

    // We do the read with allowed_company_ids covering both scope companies.
    // This works because our API user has access to both 5 and 10.
    for (const companyId of FINANCIALS_COMPANY_IDS) {
      const ctx = { allowed_company_ids: [companyId] };
      let mlOffset = 0;
      while (true) {
        const mlBatch = await odooSearchRead<OdooMoveLine>(
          'account.move.line',
          [...moveLineDomain, ['company_id', '=', companyId]],
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
            limit: MOVE_LINE_PAGE_SIZE,
            offset: mlOffset,
            order: 'id asc',
            context: ctx,
          }
        );
        if (mlBatch.length === 0) break;

        const rows = mlBatch
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
              typeof m.amount_currency === 'number'
                ? m.amount_currency
                : null,
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
        moveLinesSynced += mlBatch.length;

        if (mlBatch.length < MOVE_LINE_PAGE_SIZE) break;
        mlOffset += MOVE_LINE_PAGE_SIZE;
      }
    }

    // 6. Post-sync: flag partners who appear on any 504xxx (Home Owner Cut)
    // line as owners. Uses a single SQL pass on Supabase (cheaper than
    // round-tripping per partner).
    const { data: ownerPartnerRows } = await sb
      .from('odoo_move_lines')
      .select('partner_id, odoo_accounts!inner(code)')
      .not('partner_id', 'is', null)
      .like('odoo_accounts.code', `${OWNER_ACCOUNT_CODE_PREFIX}%`);
    const ownerPartnerIds = Array.from(
      new Set(
        (ownerPartnerRows || [])
          .map(r => (r as { partner_id: number | null }).partner_id)
          .filter((id): id is number => typeof id === 'number')
      )
    );
    if (ownerPartnerIds.length > 0) {
      // Flip the flag in one bulk update.
      await sb
        .from('odoo_partners')
        .update({ is_owner: true })
        .in('id', ownerPartnerIds);
    }

    await sb
      .from('odoo_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        companies_synced: companiesSynced,
        invoices_synced: invoicesSynced,
        accounts_synced: accountsSynced,
        partners_synced: partnersSynced,
        move_lines_synced: moveLinesSynced,
      })
      .eq('id', run.id);

    return {
      ok: true,
      run_id: run.id,
      companies_synced: companiesSynced,
      invoices_synced: invoicesSynced,
      accounts_synced: accountsSynced,
      partners_synced: partnersSynced,
      move_lines_synced: moveLinesSynced,
      owner_partners_flagged: ownerPartnerIds.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('odoo_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: msg,
      })
      .eq('id', run.id);
    return { ok: false, error: 'sync_failed', details: msg };
  }
}
