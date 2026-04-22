import { supabaseAdmin } from './supabase';

// Revenue reconciliation between Shopify (operational source of truth for
// orders) and Odoo (accounting source of truth for booked revenue).
// Account 401010 "Customers Online Orders (Shopify)" on company 6 is
// where the Kika segment books Shopify revenue. 401020 captures returns
// (negative). Net = 401010 + 401020.

export type KikaRevenueReconcile = {
  period: { from: string; to: string };
  shopify: {
    gross_orders: number;
    gross_revenue: number;           // sum(total) — includes tax + shipping
    net_revenue: number;              // gross - refunded_amount
    refunds: number;
    fulfilled_revenue: number;        // only fulfilled orders
    cancelled_revenue: number;
  };
  odoo: {
    revenue_401010: number | null;    // customers online orders (Shopify)
    returns_401020: number | null;
    net: number | null;
  };
  delta: {
    shopify_gross_vs_odoo_net: number | null;
    shopify_net_vs_odoo_net: number | null;
    shopify_net_vs_odoo_net_pct: number | null;
  };
  notes: string[];
};

function numberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function buildKikaRevenueReconcile(params: {
  fromDate: string;
  toDate: string;
}): Promise<KikaRevenueReconcile> {
  const sb = supabaseAdmin();
  const fromTs = `${params.fromDate}T00:00:00Z`;
  const toTs = `${params.toDate}T23:59:59Z`;

  // Shopify side
  const PAGE = 1000;
  let offset = 0;
  let grossOrders = 0;
  let grossRevenue = 0;
  let refundAmount = 0;
  let fulfilledRevenue = 0;
  let cancelledRevenue = 0;
  while (true) {
    const { data, error } = await sb
      .from('shopify_orders')
      .select('total, refunded_amount, fulfillment_status, cancelled_at, first_fulfilled_at')
      .gte('created_at', fromTs)
      .lt('created_at', toTs)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`reconcile shopify: ${error.message}`);
    const rows = (data as Array<{
      total: number | null;
      refunded_amount: number | null;
      fulfillment_status: string | null;
      cancelled_at: string | null;
      first_fulfilled_at: string | null;
    }>) || [];
    if (rows.length === 0) break;
    for (const r of rows) {
      grossOrders++;
      const t = Number(r.total) || 0;
      grossRevenue += t;
      refundAmount += Number(r.refunded_amount) || 0;
      if (r.cancelled_at) cancelledRevenue += t;
      else if (r.first_fulfilled_at || r.fulfillment_status === 'fulfilled') {
        fulfilledRevenue += t;
      }
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Odoo side — 401010 (Shopify sales) + 401020 (Shopify returns) on company 6.
  const { data: odooRows } = await sb
    .from('odoo_move_lines')
    .select('balance, odoo_accounts!inner(code)')
    .eq('company_id', 6)
    .in('parent_state', ['draft', 'posted'])
    .gte('date', params.fromDate)
    .lte('date', params.toDate);

  let odoo401010 = 0;
  let odoo401020 = 0;
  let anyOdoo = false;
  for (const r of (odooRows as Array<{
    balance: number;
    odoo_accounts: { code: string | null } | null;
  }> | null) || []) {
    const code = r.odoo_accounts?.code || '';
    const bal = Number(r.balance) || 0;
    // Income accounts: balance is negative on the P&L side; flip for display.
    if (code === '401010') {
      odoo401010 += -bal;
      anyOdoo = true;
    } else if (code === '401020') {
      odoo401020 += -bal;
      anyOdoo = true;
    }
  }

  const odooNet = anyOdoo ? odoo401010 + odoo401020 : null;
  const netRevenue = grossRevenue - refundAmount;

  const notes: string[] = [];
  if (!anyOdoo) {
    notes.push(
      'No 401010/401020 entries found for company 6 in the period — either no Shopify revenue was booked in Odoo or accounts are coded differently.'
    );
  }
  if (cancelledRevenue > 0) {
    notes.push(
      `${numberOrNull(cancelledRevenue)?.toLocaleString() || 0} EGP in cancelled orders (likely excluded from Odoo).`
    );
  }

  return {
    period: { from: params.fromDate, to: params.toDate },
    shopify: {
      gross_orders: grossOrders,
      gross_revenue: grossRevenue,
      net_revenue: netRevenue,
      refunds: refundAmount,
      fulfilled_revenue: fulfilledRevenue,
      cancelled_revenue: cancelledRevenue,
    },
    odoo: {
      revenue_401010: anyOdoo ? odoo401010 : null,
      returns_401020: anyOdoo ? odoo401020 : null,
      net: odooNet,
    },
    delta: {
      shopify_gross_vs_odoo_net:
        odooNet != null ? grossRevenue - odooNet : null,
      shopify_net_vs_odoo_net: odooNet != null ? netRevenue - odooNet : null,
      shopify_net_vs_odoo_net_pct:
        odooNet && odooNet !== 0
          ? ((netRevenue - odooNet) / Math.abs(odooNet)) * 100
          : null,
    },
    notes,
  };
}
