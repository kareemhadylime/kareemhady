import Link from 'next/link';
import {
  ChevronRight,
  Calendar,
  ShoppingBag,
  ShoppingCart,
  Users,
  Banknote,
  Timer,
  AlertTriangle,
  PackageX,
  Package,
  RotateCcw,
  UserCheck,
  Mail,
  Ban,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SyncPills } from '@/app/_components/sync-pills';
import { buildKikaExecReport, type KikaExecReport } from '@/lib/kika-exec';
import { buildKikaAbandonedReport } from '@/lib/kika-abandoned-checkouts';
import { getSyncFreshness } from '@/lib/sync-freshness';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRESETS: Array<{ id: string; label: string }> = [
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'mtd', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'ytd', label: 'This year' },
];

function resolvePeriod(
  preset: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined
): { from: string; to: string; label: string; id: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ym = (y: number, m: number) => `${y}-${pad(m + 1)}`;
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  if (preset === 'custom' && fromParam && toParam) {
    return { from: fromParam, to: toParam, label: `${fromParam} → ${toParam}`, id: 'custom' };
  }
  switch (preset) {
    case 'last_7d':
      return { from: daysAgo(7), to: today, label: 'Last 7 days', id: 'last_7d' };
    case 'mtd':
      return {
        from: `${ym(now.getUTCFullYear(), now.getUTCMonth())}-01`,
        to: today,
        label: 'This month',
        id: 'mtd',
      };
    case 'last_month': {
      const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      const m = (now.getUTCMonth() + 11) % 12;
      const last = new Date(Date.UTC(y, m + 1, 0));
      return {
        from: `${ym(y, m)}-01`,
        to: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`,
        label: last.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        id: 'last_month',
      };
    }
    case 'ytd':
      return { from: `${now.getUTCFullYear()}-01-01`, to: today, label: 'This year', id: 'ytd' };
    case 'last_30d':
    default:
      return { from: daysAgo(30), to: today, label: 'Last 30 days', id: 'last_30d' };
  }
}

const fmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Math.round(Number(n)).toLocaleString('en-US');
const fmt1 = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(1);
const fmtPct = (n: number | null | undefined): string =>
  n == null ? '—' : `${Number(n).toFixed(1)}%`;
const fmtHours = (h: number | null | undefined): string => {
  if (h == null || !Number.isFinite(Number(h))) return '—';
  const abs = Number(h);
  if (abs < 48) return `${abs.toFixed(1)} hrs`;
  return `${(abs / 24).toFixed(1)} days`;
};

export default async function KikaExecPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod(sp.preset, sp.from, sp.to);
  const [r, abandoned, pills] = await Promise.all([
    buildKikaExecReport({
      fromDate: period.from,
      toDate: period.to,
      label: period.label,
    }),
    buildKikaAbandonedReport({
      fromDate: period.from,
      toDate: period.to,
      label: period.label,
    }),
    getSyncFreshness(['shopify']),
  ]);

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Executive</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              KIKA · Executive Summary
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Operations snapshot · {period.label}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Orders, revenue, fulfillment, and customers for kika-swim-wear.
              All orders are cash (COD / in-person) — so "pending" = awaiting
              cash collection, not a failed card.
            </p>
          </div>
          <SyncPills pills={pills} />
        </header>

        <PeriodFilter activeId={period.id} fromDefault={period.from} toDefault={period.to} />

        {/* Row 1: ORDERS + VALUES */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BigStat
            label="Orders"
            value={fmt(r.totals.orders)}
            sub={`${fmt(r.totals.units)} units`}
            icon={<ShoppingBag size={18} className="text-indigo-600" />}
          />
          <BigStat
            label="Revenue (Gross)"
            value={fmt(r.totals.order_value_total)}
            sub="EGP · cash orders"
            icon={<Banknote size={18} className="text-emerald-600" />}
          />
          <BigStat
            label="Avg Order Value"
            value={fmt(r.totals.order_value_avg)}
            sub={`EGP · median ${fmt(r.totals.order_value_median)} · max ${fmt(r.totals.order_value_max)}`}
            icon={<Package size={18} className="text-amber-600" />}
          />
          <BigStat
            label="Unique Customers"
            value={fmt(r.customers.unique)}
            sub={
              r.customers.unique > 0 && r.totals.orders > 0
                ? `${(r.totals.orders / r.customers.unique).toFixed(2)} orders/customer`
                : ''
            }
            icon={<Users size={18} className="text-rose-600" />}
          />
        </section>

        {/* Row 2: CUSTOMERS DEEP DIVE */}
        <section className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <UserCheck size={16} className="text-rose-600" />
            Returning customers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniStat
              label="Returning in this period"
              value={fmt(r.customers.returning_in_period)}
              sub={`customers with >1 order between ${period.from} and ${period.to}`}
            />
            <MiniStat
              label="Lifetime repeat buyers"
              value={fmt(r.customers.returning_lifetime)}
              sub={
                r.customers.returning_rate_lifetime_pct != null
                  ? `${fmt1(r.customers.returning_rate_lifetime_pct)}% of unique buyers this period`
                  : ''
              }
              emphasis
            />
            <MiniStat
              label="New customers"
              value={fmt(r.customers.new_in_period)}
              sub="customers whose Shopify account was created in this period"
            />
          </div>
        </section>

        {/* Row 3: FULFILLMENT */}
        <section className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Timer size={16} className="text-indigo-600" />
            Fulfillment
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat
              label="Fulfilled"
              value={fmt(r.fulfillment.fulfilled_count)}
              sub={`${fmtPct(100 - (r.fulfillment.unfulfilled_pct ?? 0))} of orders`}
            />
            <MiniStat
              label="Unfulfilled"
              value={fmt(r.fulfillment.unfulfilled_count)}
              sub={fmtPct(r.fulfillment.unfulfilled_pct)}
              tone={r.fulfillment.unfulfilled_pct && r.fulfillment.unfulfilled_pct > 20 ? 'warn' : undefined}
            />
            <MiniStat
              label="Avg time to fulfill"
              value={fmtHours(r.fulfillment.avg_hours_to_fulfill)}
              sub={`median ${fmtHours(r.fulfillment.median_hours_to_fulfill)}`}
              emphasis
            />
            <MiniStat
              label="P90 time to fulfill"
              value={fmtHours(r.fulfillment.p90_hours_to_fulfill)}
              sub="90% of orders fulfilled faster than this"
            />
          </div>
        </section>

        {/* Row 4: REFUNDS / UNDELIVERED / CANCELLED */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="ix-card p-5 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <RotateCcw size={16} className="text-rose-600" />
              Delivered then refunded
            </h3>
            <div className="flex items-end gap-4">
              <p className="text-3xl font-bold tabular-nums text-rose-700">
                {fmt(r.refunds.delivered_then_refunded_count)}
              </p>
              <p className="text-sm text-slate-500 pb-1">
                {fmtPct(r.refunds.delivered_then_refunded_pct)} of fulfilled orders
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Refunds issued on orders that were already delivered or fulfilled
              (cancelled orders excluded). Total refund amount this period:
              {' '}<strong>{fmt(r.refunds.refunds_amount_total)} EGP</strong>.
            </p>
          </div>

          <div className="ix-card p-5 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <PackageX size={16} className="text-amber-600" />
              Undelivered orders
            </h3>
            <div className="flex items-end gap-4">
              <p className="text-3xl font-bold tabular-nums text-amber-700">
                {fmt(r.fulfillment.unfulfilled_count)}
              </p>
              <p className="text-sm text-slate-500 pb-1">
                {fmtPct(r.fulfillment.unfulfilled_pct)} of non-cancelled orders
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Orders without a successful fulfillment record AND not cancelled.
              For COD orders this is the true "not yet collected" count.
            </p>
          </div>

          <div className="ix-card p-5 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Ban size={16} className="text-slate-500" />
              Cancelled / voided
            </h3>
            <div className="flex items-end gap-4">
              <p className="text-3xl font-bold tabular-nums text-slate-700">
                {fmt(r.cancelled.count)}
              </p>
              <p className="text-sm text-slate-500 pb-1">
                {fmtPct(r.cancelled.pct)} of orders in period
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Orders with a cancelled_at timestamp, financial_status=voided, or
              fulfillment_status=cancelled. Gross-order value voided this
              period: <strong>{fmt(r.cancelled.amount_total)} EGP</strong>.
            </p>
          </div>
        </section>

        {/* Row 5: MOST ITEMS + MOST DELAYED */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="ix-card p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Package size={16} className="text-amber-600" />
              Most items ordered
            </h3>
            {r.most_items.length === 0 ? (
              <p className="text-sm text-slate-500">No line items in period.</p>
            ) : (
              <div className="overflow-y-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1">Product</th>
                      <th className="text-right py-1">Units</th>
                      <th className="text-right py-1">Orders</th>
                      <th className="text-right py-1">Revenue (EGP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.most_items.map((p, i) => (
                      <tr key={`${p.product_id}:${i}`} className="border-t border-slate-100">
                        <td className="py-1 truncate max-w-[220px]" title={p.title}>
                          {p.title}
                        </td>
                        <td className="py-1 text-right tabular-nums font-medium">{p.units}</td>
                        <td className="py-1 text-right tabular-nums text-slate-500">{p.orders}</td>
                        <td className="py-1 text-right tabular-nums">{fmt(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="ix-card p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600" />
              Most delayed orders
            </h3>
            {r.most_delayed.length === 0 ? (
              <p className="text-sm text-slate-500">No delays to flag.</p>
            ) : (
              <div className="overflow-y-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1">Order</th>
                      <th className="text-left py-1">Customer</th>
                      <th className="text-right py-1">Age / Fulfill time</th>
                      <th className="text-left py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.most_delayed.map(o => {
                      // Cancelled orders are filtered out by the builder, but
                      // we still surface the real fulfillment status here so
                      // "unfulfilled" vs "partial" vs "fulfilled" is accurate.
                      const fs = o.fulfillment_status;
                      const isFulfilledRow = fs === 'fulfilled';
                      const isPartial = fs === 'partial' || fs === 'partially_fulfilled';
                      const statusLabel = isFulfilledRow
                        ? 'fulfilled'
                        : isPartial
                          ? 'partial'
                          : 'unfulfilled';
                      const pillClass = isFulfilledRow
                        ? 'bg-emerald-50 text-emerald-700'
                        : isPartial
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700';
                      const ageHours = o.hours_to_fulfill != null
                        ? o.hours_to_fulfill
                        : o.created_at
                          ? (Date.now() - new Date(o.created_at).getTime()) / 3_600_000
                          : null;
                      return (
                        <tr key={o.id} className="border-t border-slate-100">
                          <td className="py-1 font-medium">{o.name}</td>
                          <td className="py-1 truncate max-w-[160px]" title={o.customer_name || ''}>
                            {o.customer_name || '—'}
                          </td>
                          <td className={`py-1 text-right tabular-nums ${!isFulfilledRow ? 'text-rose-600' : ''}`}>
                            {fmtHours(ageHours)}
                          </td>
                          <td className="py-1 text-[11px]">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded font-medium ${pillClass}`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Row 6: ABANDONED CHECKOUTS — recoverable revenue + emailable carts */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="ix-card p-5 space-y-2 lg:col-span-1">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart size={16} className="text-amber-600" />
              Abandoned checkouts
            </h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {fmt(abandoned.totals.abandoned_in_period)}
              </span>
              <span className="text-xs text-slate-500">still open</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {fmt(abandoned.totals.completed_in_period)} completed into orders
              this period
              {abandoned.totals.recovery_rate_pct != null && (
                <>
                  {' '}· recovery rate{' '}
                  <span className="font-semibold">
                    {abandoned.totals.recovery_rate_pct}%
                  </span>
                </>
              )}
            </p>
            <div className="border-t border-slate-100 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Recoverable revenue
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  EGP {fmt(abandoned.totals.recoverable_revenue)}
                </span>
              </div>
              {abandoned.totals.avg_cart_value != null && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Avg cart EGP {fmt(abandoned.totals.avg_cart_value)}
                </p>
              )}
            </div>
            <div className="border-t border-slate-100 pt-2 mt-2 flex items-center gap-2">
              <Mail size={13} className="text-slate-400" />
              <span className="text-[11px] text-slate-500">
                {fmt(abandoned.with_email_count)} emailable
                {abandoned.with_email_pct != null && (
                  <> ({abandoned.with_email_pct}%)</>
                )}
              </span>
            </div>
          </div>

          <div className="ix-card p-5 space-y-3 lg:col-span-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart size={16} className="text-amber-600" />
              Top open carts by value
            </h3>
            {abandoned.top_abandoned.length === 0 ? (
              <p className="text-sm text-slate-500">
                No open abandoned carts in period.
              </p>
            ) : (
              <div className="overflow-y-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1">Customer / email</th>
                      <th className="text-right py-1">Items</th>
                      <th className="text-right py-1">Value (EGP)</th>
                      <th className="text-right py-1">Age</th>
                      <th className="text-left py-1">Recover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abandoned.top_abandoned.map(a => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="py-1 truncate max-w-[220px]">
                          <div className="truncate font-medium">
                            {a.customer_name || a.email || '—'}
                          </div>
                          {a.customer_name && a.email && (
                            <div className="truncate text-[11px] text-slate-500">
                              {a.email}
                            </div>
                          )}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-500">
                          {a.line_items_count ?? '—'}
                        </td>
                        <td className="py-1 text-right tabular-nums font-medium">
                          {a.total_price != null ? fmt(a.total_price) : '—'}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-500">
                          {fmtHours(a.age_hours)}
                        </td>
                        <td className="py-1">
                          {a.abandoned_checkout_url ? (
                            <a
                              href={a.abandoned_checkout_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-700 hover:underline text-[11px]"
                            >
                              link ↗
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          {r.totals.orders} orders · {r.totals.units} units aggregated. Period
          {' '}{period.from} → {period.to}. Fulfillment times parsed from
          Shopify fulfillments[].created_at. Cash-only payment model.
          Abandoned-checkout window is Shopify's retention policy (~30 days).
        </footer>
      </main>
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

function BigStat({
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
      <p className="text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
  tone?: 'warn';
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-amber-700'
      : emphasis
        ? 'text-indigo-700'
        : 'text-slate-900';
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}
