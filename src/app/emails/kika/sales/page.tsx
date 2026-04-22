import Link from 'next/link';
import {
  ChevronRight,
  Calendar,
  ShoppingBag,
  Banknote,
  Package,
  Users,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SyncPills } from '@/app/_components/sync-pills';
import {
  buildKikaSalesReport,
  fetchKikaOrderDetail,
  type KikaSalesReport,
  type KikaOrderDetail,
} from '@/lib/kika-sales';
import { getSyncFreshness } from '@/lib/sync-freshness';
import { fmtCairoDateTime } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRESETS: Array<{ id: string; label: string }> = [
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'mtd', label: 'This month' },
  { id: 'ytd', label: 'This year' },
];

function resolvePeriod(
  preset: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined
): { from: string; to: string; label: string; id: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  if (preset === 'custom' && fromParam && toParam) {
    return {
      from: fromParam,
      to: toParam,
      label: `${fromParam} → ${toParam}`,
      id: 'custom',
    };
  }
  switch (preset) {
    case 'last_7d':
      return { from: daysAgo(7), to: today, label: 'Last 7 days', id: 'last_7d' };
    case 'mtd':
      return {
        from: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
        to: today,
        label: 'This month',
        id: 'mtd',
      };
    case 'ytd':
      return {
        from: `${now.getUTCFullYear()}-01-01`,
        to: today,
        label: 'This year',
        id: 'ytd',
      };
    case 'last_30d':
    default:
      return {
        from: daysAgo(30),
        to: today,
        label: 'Last 30 days',
        id: 'last_30d',
      };
  }
}

const fmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Math.round(Number(n)).toLocaleString('en-US');

function buildQs(
  current: { preset?: string; from?: string; to?: string; order?: string },
  next: Partial<{ preset: string; from: string; to: string; order: string | null }>
): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) {
    if (v) merged[k] = String(v);
  }
  for (const [k, v] of Object.entries(next)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `?${qs}` : '';
}

export default async function KikaSalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    order?: string;
  }>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod(sp.preset, sp.from, sp.to);
  const [report, pills, orderDetail] = await Promise.all([
    buildKikaSalesReport({
      fromDate: period.from,
      toDate: period.to,
      label: period.label,
    }),
    getSyncFreshness(['shopify']),
    sp.order ? fetchKikaOrderDetail(sp.order) : Promise.resolve(null),
  ]);

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Sales</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              KIKA · Sales Intelligence
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Shopify Orders · {period.label}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Live from the kika-swim-wear Shopify store. Totals in EGP.
            </p>
            <div className="mt-2"><SyncPills pills={pills} /></div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-1">
            {report.latest_sync ? (
              <>
                <p className="flex items-center gap-1.5 justify-end">
                  <RefreshCcw size={12} />
                  Synced{' '}
                  {report.latest_sync.finished_at
                    ? fmtCairoDateTime(report.latest_sync.finished_at)
                    : '—'}
                </p>
                <p className="text-[11px]">
                  {report.latest_sync.orders_synced} orders ·{' '}
                  {report.latest_sync.line_items_synced} line items
                </p>
              </>
            ) : (
              <p>
                No sync yet. POST to{' '}
                <code className="text-[10px]">/api/shopify/run-now</code>.
              </p>
            )}
          </div>
        </header>

        <PeriodFilter
          activeId={period.id}
          fromDefault={period.from}
          toDefault={period.to}
        />

        <TotalsBlock report={report} />

        <DailyTrendBlock daily={report.daily} />

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProductsCard products={report.top_products} />
          <TopCustomersCard customers={report.top_customers} />
        </section>

        <StatusBreakdownBlock report={report} />

        <RecentOrdersBlock
          orders={report.recent_orders}
          openHref={id => buildQs(sp, { order: String(id) })}
        />

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          {report.totals.orders} orders aggregated · {period.from} → {period.to}.
          Daily cron 04:45 UTC, manual trigger at{' '}
          <code className="text-[10px]">/api/shopify/run-now</code>.
        </footer>
      </main>

      {orderDetail && (
        <OrderDetailModal
          order={orderDetail}
          closeHref={buildQs(sp, { order: null })}
        />
      )}
    </>
  );
}

function PeriodFilter({
  activeId,
  fromDefault,
  toDefault,
}: {
  activeId: string;
  fromDefault: string;
  toDefault: string;
}) {
  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold">Period</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <Link
            key={p.id}
            href={`?preset=${p.id}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              activeId === p.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form action="" method="get" className="flex items-end gap-2">
        <input type="hidden" name="preset" value="custom" />
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">From</span>
          <input type="date" name="from" defaultValue={fromDefault} className="ix-input w-[160px]" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">To</span>
          <input type="date" name="to" defaultValue={toDefault} className="ix-input w-[160px]" />
        </label>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Apply
        </button>
      </form>
    </section>
  );
}

function TotalsBlock({ report }: { report: KikaSalesReport }) {
  const t = report.totals;
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Orders"
        value={fmt(t.orders)}
        sub={`${t.paid_orders} paid · ${t.pending_orders} pending`}
        icon={<ShoppingBag size={18} className="text-indigo-600" />}
      />
      <StatCard
        label="Revenue Collected"
        value={fmt(t.gross_revenue)}
        sub={`EGP · ${fmt(t.paid_orders)} paid + fulfilled · pot'l ${fmt(t.potential_revenue)}`}
        icon={<Banknote size={18} className="text-emerald-600" />}
      />
      <StatCard
        label="Avg Order Value"
        value={fmt(t.avg_order_value)}
        sub={`EGP · ${fmt(t.units_sold)} units sold`}
        icon={<Package size={18} className="text-amber-600" />}
      />
      <StatCard
        label="Customers"
        value={fmt(t.unique_customers)}
        sub={
          t.unique_customers > 0 && t.orders > 0
            ? `${(t.orders / t.unique_customers).toFixed(2)} orders per customer`
            : ''
        }
        icon={<Users size={18} className="text-rose-600" />}
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ix-card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function DailyTrendBlock({
  daily,
}: {
  daily: KikaSalesReport['daily'];
}) {
  if (daily.length === 0) return null;
  const maxRev = Math.max(...daily.map(d => d.revenue), 1);
  const maxOrders = Math.max(...daily.map(d => d.orders), 1);
  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-600" />
          Daily trend
        </h2>
        <p className="text-[11px] text-slate-500">
          {daily.length} days · peak {fmt(maxRev)} EGP on{' '}
          {daily.find(d => d.revenue === maxRev)?.day}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left py-1">Day</th>
              <th className="text-right py-1">Orders</th>
              <th className="text-right py-1">Units</th>
              <th className="text-right py-1">Revenue (EGP)</th>
              <th className="text-left py-1 pl-4 w-1/2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {daily.map(d => (
              <tr key={d.day} className="border-t border-slate-100">
                <td className="py-1 font-mono text-[10px]">{d.day}</td>
                <td className="py-1 text-right tabular-nums">{d.orders}</td>
                <td className="py-1 text-right tabular-nums text-slate-500">{d.units}</td>
                <td className="py-1 text-right tabular-nums">{fmt(d.revenue)}</td>
                <td className="py-1 pl-4">
                  <div
                    className="h-2 rounded bg-indigo-500/80"
                    style={{ width: `${(d.revenue / maxRev) * 100}%` }}
                    title={`${fmt(d.revenue)} · ${d.orders}/${maxOrders} orders`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopProductsCard({
  products,
}: {
  products: KikaSalesReport['top_products'];
}) {
  return (
    <div className="ix-card p-5 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Package size={16} className="text-amber-600" />
        Top products · by revenue
      </h3>
      {products.length === 0 ? (
        <p className="text-sm text-slate-500">No line items in this period.</p>
      ) : (
        <div className="overflow-y-auto max-h-[360px]">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left">Product</th>
                <th className="text-right">Units</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Revenue (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={`${p.product_id}:${i}`} className="border-t border-slate-100">
                  <td className="py-1 truncate max-w-[240px]" title={p.title}>
                    {p.title}
                  </td>
                  <td className="py-1 text-right tabular-nums">{p.units}</td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{p.orders}</td>
                  <td className="py-1 text-right tabular-nums">{fmt(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopCustomersCard({
  customers,
}: {
  customers: KikaSalesReport['top_customers'];
}) {
  return (
    <div className="ix-card p-5 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Users size={16} className="text-rose-600" />
        Top customers · by revenue
      </h3>
      {customers.length === 0 ? (
        <p className="text-sm text-slate-500">No orders in this period.</p>
      ) : (
        <div className="overflow-y-auto max-h-[360px]">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left">Customer</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Revenue (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={`${c.customer_id}:${i}`} className="border-t border-slate-100">
                  <td className="py-1 truncate max-w-[240px]" title={c.name}>
                    {c.name}
                  </td>
                  <td className="py-1 text-right tabular-nums">{c.orders}</td>
                  <td className="py-1 text-right tabular-nums">{fmt(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBreakdownBlock({ report }: { report: KikaSalesReport }) {
  const finTotal = report.by_financial_status.reduce((s, r) => s + r.count, 0);
  const ffTotal = report.by_fulfillment_status.reduce((s, r) => s + r.count, 0);
  const pctOf = (n: number, denom: number): string =>
    denom > 0 ? `${((n / denom) * 100).toFixed(1)}%` : '—';
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="ix-card p-5 space-y-2">
        <h3 className="text-sm font-semibold">Financial status</h3>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left py-1">Status</th>
              <th className="text-right py-1">Count</th>
              <th className="text-right py-1">% of {fmt(finTotal)}</th>
              <th className="text-right py-1">Revenue (EGP)</th>
            </tr>
          </thead>
          <tbody>
            {report.by_financial_status.map(r => (
              <tr key={r.status} className="border-t border-slate-100">
                <td className="py-1.5 capitalize">{r.status.replace(/_/g, ' ')}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">
                  {r.count}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">
                  {pctOf(r.count, finTotal)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {fmt(r.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ix-card p-5 space-y-2">
        <h3 className="text-sm font-semibold">Fulfillment</h3>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left py-1">Status</th>
              <th className="text-right py-1">Count</th>
              <th className="text-right py-1">% of {fmt(ffTotal)}</th>
            </tr>
          </thead>
          <tbody>
            {report.by_fulfillment_status.map(r => (
              <tr key={r.status} className="border-t border-slate-100">
                <td className="py-1.5 capitalize">{r.status.replace(/_/g, ' ')}</td>
                <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">
                  {pctOf(r.count, ffTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentOrdersBlock({
  orders,
  openHref,
}: {
  orders: KikaSalesReport['recent_orders'];
  openHref: (id: number) => string;
}) {
  if (orders.length === 0) return null;
  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold">Recent orders</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Order</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-right px-3 py-2">Items</th>
              <th className="text-right px-3 py-2">Total (EGP)</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Fulfillment</th>
              <th className="text-left px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr
                key={o.id}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition group"
              >
                <td className="px-3 py-1.5 font-medium">
                  <Link
                    href={openHref(o.id)}
                    scroll={false}
                    className="block text-inherit group-hover:text-indigo-700"
                  >
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5 truncate max-w-[200px]">
                  <Link href={openHref(o.id)} scroll={false} className="block">
                    {o.customer_name || o.email || '—'}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Link href={openHref(o.id)} scroll={false} className="block">
                    {o.line_item_count ?? 0}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  <Link href={openHref(o.id)} scroll={false} className="block">
                    {fmt(o.total)}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-[11px]">
                  <StatusPill status={o.financial_status} />
                </td>
                <td className="px-3 py-1.5 text-[11px]">
                  <StatusPill
                    status={
                      o.cancelled_at ||
                      o.financial_status === 'voided' ||
                      o.fulfillment_status === 'cancelled'
                        ? 'cancelled'
                        : o.fulfillment_status || 'unfulfilled'
                    }
                  />
                </td>
                <td className="px-3 py-1.5 text-[11px] text-slate-500">
                  {o.created_at
                    ? new Date(o.created_at).toLocaleDateString('en-US')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status || '').toLowerCase();
  const color =
    s === 'paid' || s === 'fulfilled'
      ? 'bg-emerald-50 text-emerald-700'
      : s === 'pending'
        ? 'bg-amber-50 text-amber-700'
        : s === 'refunded' || s === 'partially_refunded'
          ? 'bg-rose-50 text-rose-700'
          : s === 'cancelled' || s === 'voided'
            ? 'bg-slate-200 text-slate-700 line-through decoration-slate-400'
            : 'bg-slate-100 text-slate-600';
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded capitalize text-[10px] font-medium ${color}`}
    >
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function OrderDetailModal({
  order,
  closeHref,
}: {
  order: KikaOrderDetail;
  closeHref: string;
}) {
  const raw = (order.raw || {}) as Record<string, unknown>;
  const shipping =
    (raw['shipping_address'] as Record<string, unknown> | null) || null;
  const billing =
    (raw['billing_address'] as Record<string, unknown> | null) || null;
  const note = (raw['note'] as string | null) || null;
  const phone =
    (raw['phone'] as string | null) ||
    (shipping?.['phone'] as string | null) ||
    null;
  const isCancelled =
    !!order.cancelled_at ||
    order.financial_status === 'voided' ||
    order.fulfillment_status === 'cancelled';
  return (
    <>
      {/* Backdrop — clicking it closes the modal */}
      <Link
        href={closeHref || '/emails/kika/sales'}
        scroll={false}
        aria-label="Close order details"
        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]"
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-label={`Order ${order.name || order.id}`}
        className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      >
        <div className="pointer-events-auto w-full max-w-3xl bg-white rounded-2xl shadow-xl my-4">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap sticky top-0 bg-white rounded-t-2xl">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight">
                  Order {order.name || `#${order.id}`}
                </h2>
                <StatusPill status={order.financial_status} />
                <StatusPill
                  status={
                    isCancelled
                      ? 'cancelled'
                      : order.fulfillment_status || 'unfulfilled'
                  }
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Created{' '}
                {order.created_at
                  ? new Date(order.created_at).toLocaleString('en-US')
                  : '—'}
                {order.cancelled_at && (
                  <>
                    {' '}
                    · Cancelled {new Date(order.cancelled_at).toLocaleString('en-US')}
                  </>
                )}
                {order.first_fulfilled_at && (
                  <>
                    {' '}
                    · Fulfilled{' '}
                    {new Date(order.first_fulfilled_at).toLocaleString('en-US')}
                  </>
                )}
              </p>
            </div>
            <Link
              href={closeHref || '/emails/kika/sales'}
              scroll={false}
              className="text-slate-500 hover:text-slate-900 text-sm border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50"
            >
              Close ×
            </Link>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5 text-sm">
            {/* Customer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                  Customer
                </p>
                <p className="font-medium mt-1">
                  {order.customer_name || '—'}
                </p>
                {order.email && (
                  <p className="text-[11px] text-slate-500">{order.email}</p>
                )}
                {phone && (
                  <p className="text-[11px] text-slate-500">{phone}</p>
                )}
              </div>
              {shipping && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                    Shipping address
                  </p>
                  <p className="text-[12px] mt-1 whitespace-pre-wrap">
                    {[
                      shipping.name,
                      shipping.address1,
                      shipping.address2,
                      [shipping.city, shipping.province, shipping.zip]
                        .filter(Boolean)
                        .join(', '),
                      shipping.country,
                    ]
                      .filter(Boolean)
                      .join('\n') || '—'}
                  </p>
                </div>
              )}
            </div>

            {/* Line items */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-2">
                Line items ({order.line_items.length})
              </p>
              {order.line_items.length === 0 ? (
                <p className="text-slate-500 text-[12px]">—</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-[12px]">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-1.5">Product</th>
                        <th className="text-left px-3 py-1.5">SKU</th>
                        <th className="text-right px-3 py-1.5">Qty</th>
                        <th className="text-right px-3 py-1.5">Price</th>
                        <th className="text-right px-3 py-1.5">Discount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.line_items.map(li => (
                        <tr key={li.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 truncate max-w-[280px]">
                            <div className="font-medium truncate">
                              {li.title || li.name || '—'}
                            </div>
                            {li.vendor && (
                              <div className="text-[10px] text-slate-500">
                                {li.vendor}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-[10px] text-slate-500 font-mono">
                            {li.sku || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {li.quantity ?? '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {li.price != null ? fmt(li.price) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                            {li.total_discount && li.total_discount > 0
                              ? `−${fmt(li.total_discount)}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                  Totals (EGP)
                </p>
                <dl className="text-[12px] space-y-0.5">
                  <TotRow label="Subtotal" value={order.subtotal} />
                  <TotRow label="Discount" value={order.total_discounts} negative />
                  <TotRow label="Shipping" value={order.total_shipping} />
                  <TotRow label="Tax" value={order.total_tax} />
                  <TotRow
                    label="Total"
                    value={order.total}
                    bold
                  />
                  {order.refunded_amount != null && order.refunded_amount > 0 && (
                    <TotRow
                      label="Refunded"
                      value={order.refunded_amount}
                      negative
                    />
                  )}
                </dl>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                  Meta
                </p>
                <dl className="text-[12px] space-y-0.5">
                  <MetaRow label="Order ID" value={String(order.id)} mono />
                  <MetaRow label="Currency" value={order.currency || 'EGP'} />
                  <MetaRow
                    label="Line items"
                    value={String(order.line_item_count ?? order.line_items.length)}
                  />
                  {order.hours_to_fulfill != null && (
                    <MetaRow
                      label="Fulfill time"
                      value={`${order.hours_to_fulfill.toFixed(1)} hrs`}
                    />
                  )}
                  {Array.isArray(order.tags) && order.tags.length > 0 && (
                    <MetaRow label="Tags" value={order.tags.join(', ')} />
                  )}
                </dl>
              </div>
            </div>

            {note && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                  Customer note
                </p>
                <p className="text-[12px] mt-1 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
                  {note}
                </p>
              </div>
            )}

            {billing && billing !== shipping && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                  Billing address
                </p>
                <p className="text-[12px] mt-1 whitespace-pre-wrap">
                  {[
                    billing.name,
                    billing.address1,
                    billing.address2,
                    [billing.city, billing.province, billing.zip]
                      .filter(Boolean)
                      .join(', '),
                    billing.country,
                  ]
                    .filter(Boolean)
                    .join('\n') || '—'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function TotRow({
  label,
  value,
  negative,
  bold,
}: {
  label: string;
  value: number | null;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        bold ? 'border-t border-slate-100 pt-1 font-semibold' : ''
      }`}
    >
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`tabular-nums ${negative && value ? 'text-rose-600' : ''}`}
      >
        {value != null
          ? `${negative && value > 0 ? '−' : ''}${fmt(value)}`
          : '—'}
      </dd>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`tabular-nums text-right truncate max-w-[200px] ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
