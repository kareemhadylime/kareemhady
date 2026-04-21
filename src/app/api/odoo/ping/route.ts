import { NextRequest, NextResponse } from 'next/server';
import {
  odooVersion,
  odooSearchRead,
  odooSearchCount,
  type OdooInvoice,
  type OdooPartner,
  type OdooAnalyticAccount,
} from '@/lib/odoo';

// Smoke-test endpoint for the Odoo 18 integration. Returns server version +
// small samples of invoices/partners/analytic accounts so we can verify the
// credentials + read access work.
//
// Protected by CRON_SECRET (same bearer pattern as the daily cron):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/odoo/ping

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  try {
    // Run the four reads in parallel. Invoice domain filters to posted
    // customer/vendor invoices only — drafts + cancels would inflate counts.
    const invoiceDomain = [
      ['move_type', 'in', ['out_invoice', 'in_invoice']],
      ['state', '=', 'posted'],
    ];

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
