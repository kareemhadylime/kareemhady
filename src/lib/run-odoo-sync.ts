import { supabaseAdmin } from './supabase';
import {
  odooSearchRead,
  type OdooCompany,
  type OdooInvoice,
} from './odoo';

// Beithady finance scope. A1HOSPITALITY retained in the invoice backfill
// for a future BH-435 owner-side view but EXCLUDED from the consolidated
// Financials rule — see memory/beithady_intercompany_model.md.
//   4  = A1HOSPITALITY (BH-435 owner; Lime 50% stake)
//   5  = Beithady Hospitality - (EGYPT)
//   10 = Beithady Hospitality FZCO - (Dubai)
const SCOPE_COMPANY_IDS = [4, 5, 10];

const BACKFILL_DAYS = 365;
const PAGE_SIZE = 200;

export function cutoffDate(days = BACKFILL_DAYS): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
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

  try {
    for (const companyId of SCOPE_COMPANY_IDS) {
      const ctx = { allowed_company_ids: [companyId] };

      // 1. Company record — upsert with in_scope=true and partner_id so we
      // can eliminate intercompany lines in the P&L aggregator.
      const companyRows = await odooSearchRead<OdooCompany>(
        'res.company',
        [['id', '=', companyId]],
        {
          fields: ['name', 'country_id', 'currency_id', 'partner_id'],
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
          partner_id: Array.isArray(company.partner_id)
            ? company.partner_id[0]
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

    await sb
      .from('odoo_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        companies_synced: companiesSynced,
        invoices_synced: invoicesSynced,
      })
      .eq('id', run.id);

    return {
      ok: true,
      run_id: run.id,
      companies_synced: companiesSynced,
      invoices_synced: invoicesSynced,
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
