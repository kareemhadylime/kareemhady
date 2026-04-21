import { NextRequest, NextResponse } from 'next/server';
import {
  odooVersion,
  odooSearchRead,
  odooSearchCount,
  type OdooInvoice,
  type OdooPartner,
  type OdooAnalyticAccount,
  type OdooCompany,
} from '@/lib/odoo';

// Smoke-test endpoint for the Odoo 18 integration. Returns server version +
// small samples of invoices/partners/analytic accounts so we can verify the
// credentials + read access work.
//
// Protected by CRON_SECRET (same bearer pattern as the daily cron):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/odoo/ping
//
// Explore mode (?explore=1) pivots the response to list all res.company rows
// with per-company posted-invoice counts + journal counts. Used once to
// identify the Beithady company IDs before writing the Phase 7.1 migration.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured on server' },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const env = {
    ODOO_URL: !!process.env.ODOO_URL,
    ODOO_DB: !!process.env.ODOO_DB,
    ODOO_USER: !!process.env.ODOO_USER,
    ODOO_API_KEY: !!process.env.ODOO_API_KEY,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Odoo credentials missing: ${missing.join(', ')}`,
        env,
      },
      { status: 400 }
    );
  }

  const started = Date.now();
  const explore = req.nextUrl.searchParams.get('explore') === '1';

  // Invoice domain — reused in both modes. Filters to posted customer/vendor
  // invoices only; drafts + cancels would inflate counts.
  const invoiceDomain = [
    ['move_type', 'in', ['out_invoice', 'in_invoice']],
    ['state', '=', 'posted'],
  ];

  if (explore) {
    try {
      // List all companies. Pass allowed_company_ids context to bypass the
      // API user's default-company scoping (otherwise Odoo filters to just
      // the user's current-selected company).
      const companies = await odooSearchRead<OdooCompany>(
        'res.company',
        [],
        {
          fields: ['name', 'country_id', 'currency_id', 'partner_id'],
          limit: 100,
          order: 'id asc',
        }
      );

      const allCompanyIds = companies.map(c => c.id);

      // Per-company posted-invoice count. Pass allowed_company_ids per call
      // so the domain's company_id filter actually sees that company's data.
      const perCompany = await Promise.all(
        companies.map(async c => {
          try {
            const [invoiceCount, journalCount] = await Promise.all([
              odooSearchCount(
                'account.move',
                [...invoiceDomain, ['company_id', '=', c.id]],
                { context: { allowed_company_ids: allCompanyIds } }
              ),
              odooSearchCount(
                'account.journal',
                [['company_id', '=', c.id]],
                { context: { allowed_company_ids: allCompanyIds } }
              ),
            ]);
            return {
              id: c.id,
              name: c.name,
              country: Array.isArray(c.country_id) ? c.country_id[1] : null,
              currency: Array.isArray(c.currency_id) ? c.currency_id[1] : null,
              posted_invoice_count: invoiceCount,
              journal_count: journalCount,
            };
          } catch (e) {
            return {
              id: c.id,
              name: c.name,
              country: Array.isArray(c.country_id) ? c.country_id[1] : null,
              currency: Array.isArray(c.currency_id) ? c.currency_id[1] : null,
              error: e instanceof Error ? e.message : String(e),
            };
          }
        })
      );

      return NextResponse.json({
        ok: true,
        mode: 'explore',
        duration_ms: Date.now() - started,
        company_count: companies.length,
        companies: perCompany,
      });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          mode: 'explore',
          duration_ms: Date.now() - started,
          error: e instanceof Error ? e.message : String(e),
        },
        { status: 500 }
      );
    }
  }

  try {
    const [version, invoiceCount, invoices, partners, analyticAccounts] =
      await Promise.all([
        odooVersion(),
        odooSearchCount('account.move', invoiceDomain),
        odooSearchRead<OdooInvoice>('account.move', invoiceDomain, {
          fields: [
            'name',
            'move_type',
            'state',
            'partner_id',
            'invoice_date',
            'amount_total',
            'amount_total_signed',
            'currency_id',
          ],
          limit: 5,
          order: 'invoice_date desc, id desc',
        }),
        odooSearchRead<OdooPartner>('res.partner', [], {
          fields: [
            'name',
            'email',
            'phone',
            'is_company',
            'supplier_rank',
            'customer_rank',
          ],
          limit: 5,
          order: 'id desc',
        }),
        odooSearchRead<OdooAnalyticAccount>(
          'account.analytic.account',
          [],
          {
            fields: ['name', 'code', 'balance'],
            limit: 5,
            order: 'id desc',
          }
        ),
      ]);

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      server: {
        version: version.server_version,
        serie: version.server_serie,
      },
      invoices: {
        posted_total: invoiceCount,
        sample: invoices.map(i => ({
          id: i.id,
          name: i.name,
          type: i.move_type,
          state: i.state,
          partner: Array.isArray(i.partner_id) ? i.partner_id[1] : null,
          date: i.invoice_date || null,
          amount_total: i.amount_total,
          currency: Array.isArray(i.currency_id) ? i.currency_id[1] : null,
        })),
      },
      partners: {
        sample: partners.map(p => ({
          id: p.id,
          name: p.name,
          email: p.email || null,
          is_company: p.is_company,
          supplier_rank: p.supplier_rank,
          customer_rank: p.customer_rank,
        })),
      },
      analytic_accounts: {
        // Per-property P&L tags — expect one per Beithady listing eventually.
        sample: analyticAccounts.map(a => ({
          id: a.id,
          name: a.name,
          code: a.code || null,
          balance: a.balance,
        })),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        duration_ms: Date.now() - started,
        error: msg,
      },
      { status: 500 }
    );
  }
}
