import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  ShoppingBag,
  Wallet,
  Package,
  Mail,
  Play,
  CheckCircle2,
  XCircle,
  Calendar,
  BedDouble,
  Building2,
  Moon,
  Users,
  TrendingUp,
  CalendarClock,
  Star,
  Globe2,
} from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
import { Stat } from '@/app/_components/stat';
import { runRuleAction } from '@/app/admin/rules/actions';
import {
  RANGE_PRESETS,
  resolvePreset,
  dateInputValue,
  isDomain,
  DOMAIN_LABELS,
  type RangePreset,
  type Domain,
} from '@/lib/rules/presets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function RuleOutputDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; ruleId: string }>;
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { domain, ruleId } = await params;
  const sp = await searchParams;

  if (domain !== 'other' && !isDomain(domain)) notFound();

  const sb = supabaseAdmin();

  const [{ data: rule }, { data: runs }] = await Promise.all([
    sb.from('rules').select('*, account:accounts(email)').eq('id', ruleId).single(),
    sb
      .from('rule_runs')
      .select('*')
      .eq('rule_id', ruleId)
      .order('started_at', { ascending: false })
      .limit(20),
  ]);
  if (!rule) notFound();

  const ruleDomainSlug = rule.domain && isDomain(rule.domain) ? rule.domain : 'other';
  if (ruleDomainSlug !== domain) notFound();

  const domainLabel = isDomain(domain) ? DOMAIN_LABELS[domain as Domain] : 'Other';

  const latest = runs?.[0];
  const out = latest?.output as any;
  const actionType = (rule.actions as any)?.type || 'shopify_order_aggregate';
  const isBeithady = actionType === 'beithady_booking_aggregate';

  const lastRange = out?.time_range as
    | {
        from: string;
        to: string;
        label?: string;
        preset_id?: string;
        clamped_to_year_start?: boolean;
        requested_from?: string;
      }
    | undefined;

  const validPresets = RANGE_PRESETS.map(p => p.id);
  const urlPreset =
    sp.preset && validPresets.includes(sp.preset as RangePreset)
      ? (sp.preset as RangePreset)
      : null;
  const lastRunPreset =
    lastRange?.preset_id && validPresets.includes(lastRange.preset_id as RangePreset)
      ? (lastRange.preset_id as RangePreset)
      : null;
  const labelFallbackPreset = lastRange?.label
    ? (RANGE_PRESETS.find(p => p.label === lastRange.label)?.id ?? null)
    : null;
  const activePreset: RangePreset =
    urlPreset || lastRunPreset || labelFallbackPreset || 'last24h';
  const presetResolved = resolvePreset(activePreset);
  const fromDefault = sp.from || dateInputValue(presetResolved.fromIso);
  const toDefault = sp.to || dateInputValue(presetResolved.toIso);

  const yearStartStr = `${new Date().getUTCFullYear()}-01-01`;

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href={`/emails/${domain}`} className="ix-link">{domainLabel}</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span className="truncate max-w-[200px]">{rule.name}</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              {domainLabel} · Rule output
            </p>
            <h1 className="text-3xl font-bold tracking-tight">{rule.name}</h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Mail size={14} /> {(rule as any).account?.email || 'all accounts'}
              </span>
              <span>·</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                {actionType}
              </span>
              {latest && (
                <>
                  <span>·</span>
                  <span>
                    Last run{' '}
                    {latest.finished_at
                      ? new Date(latest.finished_at).toLocaleString()
                      : '…'}
                  </span>
                </>
              )}
            </p>
          </div>
        </header>

        <section className="ix-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-indigo-600" />
            <h2 className="text-sm font-semibold">Time range</h2>
            {lastRange && (
              <span className="text-xs text-slate-500">
                Last run covered:{' '}
                <span className="font-medium text-slate-700">
                  {new Date(lastRange.from).toLocaleDateString()}
                  {' → '}
                  {new Date(lastRange.to).toLocaleDateString()}
                  {lastRange.label && ` (${lastRange.label})`}
                </span>
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Pick a preset to run instantly, or set custom From/To dates. Searches are
            always capped at Jan 1, {new Date().getUTCFullYear()} at the earliest.
          </p>

          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map(p => (
              <form key={p.id} action={runRuleAction}>
                <input type="hidden" name="id" value={ruleId} />
                <input type="hidden" name="preset" value={p.id} />
                <button
                  type="submit"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    activePreset === p.id
                      ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              </form>
            ))}
          </div>

          <form action={runRuleAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={ruleId} />
            <input type="hidden" name="preset" value="custom" />
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-700">From</span>
              <input
                type="date"
                name="from"
                defaultValue={fromDefault}
                min={yearStartStr}
                className="ix-input w-[160px]"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-700">To</span>
              <input
                type="date"
                name="to"
                defaultValue={toDefault}
                min={yearStartStr}
                className="ix-input w-[160px]"
              />
            </label>
            <button type="submit" className="ix-btn-primary">
              <Play size={16} /> Run with this range
            </button>
          </form>
        </section>

        {!latest ? (
          <div className="ix-card p-10 text-center">
            <p className="text-slate-500 mb-4">
              No runs yet. Pick a range above and click &ldquo;Run&rdquo; to evaluate.
            </p>
          </div>
        ) : (
          <>
            {latest.status === 'failed' && (
              <div className="ix-card p-4 border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-start gap-2">
                <XCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Last run failed</div>
                  <div className="text-xs mt-0.5">{latest.error}</div>
                </div>
              </div>
            )}

            {out?.parse_errors > 0 && (
              <details className="ix-card border-amber-200 bg-amber-50 text-amber-800 text-sm">
                <summary className="p-4 cursor-pointer font-medium">
                  {out.parse_errors} email(s) could not be parsed and were skipped.
                  {Array.isArray(out.parse_failures) && out.parse_failures.length > 0 && (
                    <span className="ml-1 text-xs text-amber-700 font-normal">
                      (click to see which)
                    </span>
                  )}
                </summary>
                {Array.isArray(out.parse_failures) && out.parse_failures.length > 0 && (
                  <ul className="px-4 pb-4 space-y-2 text-xs">
                    {out.parse_failures.slice(0, 50).map((f: any, i: number) => (
                      <li
                        key={i}
                        className="border-t border-amber-200 pt-2 first:border-t-0 first:pt-0"
                      >
                        <div className="font-medium truncate">{f.subject || '(no subject)'}</div>
                        <div className="text-amber-700 truncate">{f.from}</div>
                        <div className="text-amber-600">Reason: {f.reason}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}

            {lastRange?.clamped_to_year_start && (
              <div className="ix-card p-4 border-amber-200 bg-amber-50 text-amber-800 text-sm">
                Requested start date{' '}
                {lastRange.requested_from
                  ? new Date(lastRange.requested_from).toLocaleDateString()
                  : ''}{' '}
                was clamped to {new Date(lastRange.from).toLocaleDateString()} (Jan 1 cap).
              </div>
            )}

            {typeof out?.marked_read === 'number' && out.marked_read > 0 && (
              <div className="ix-card p-4 border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
                <CheckCircle2 size={16} />
                Marked {out.marked_read} email(s) as read in Gmail.
                {out.mark_errors > 0 && (
                  <span className="text-amber-700">
                    {' '}({out.mark_errors} could not be marked — re-Connect the
                    mailbox to grant gmail.modify scope.)
                  </span>
                )}
              </div>
            )}

            {isBeithady ? (
              <BeithadyView out={out} emailsMatched={latest.input_email_count ?? 0} />
            ) : (
              <ShopifyView out={out} rule={rule} emailsMatched={latest.input_email_count ?? 0} />
            )}

            <section className="ix-card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold">Run history</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left py-2.5 px-6 font-medium">Started</th>
                    <th className="text-left px-6 font-medium">Range</th>
                    <th className="text-left px-6 font-medium">Status</th>
                    <th className="text-right px-6 font-medium">Emails</th>
                    <th className="text-right px-6 font-medium">
                      {isBeithady ? 'Reservations' : 'Orders'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs?.map(r => {
                    const tr = (r.output as any)?.time_range;
                    const count = isBeithady
                      ? (r.output as any)?.reservation_count
                      : (r.output as any)?.order_count;
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-2.5 px-6 whitespace-nowrap">
                          {new Date(r.started_at).toLocaleString()}
                        </td>
                        <td className="px-6 text-xs text-slate-600 whitespace-nowrap">
                          {tr
                            ? `${new Date(tr.from).toLocaleDateString()} → ${new Date(tr.to).toLocaleDateString()}`
                            : '—'}
                        </td>
                        <td className="px-6">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-6 text-right tabular-nums">{r.input_email_count}</td>
                        <td className="px-6 text-right tabular-nums">
                          {count ?? '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function ShopifyView({
  out,
  rule,
  emailsMatched,
}: {
  out: any;
  rule: any;
  emailsMatched: number;
}) {
  const orders = out?.order_count ?? 0;
  const total = out?.total_amount ?? 0;
  const currency = out?.currency || (rule.actions?.currency as string) || 'EGP';
  const products = out?.products || [];
  const orderList = out?.orders || [];

  const subtotal =
    out?.line_items_subtotal ??
    products.reduce((s: number, p: any) => s + (p.total_revenue || 0), 0);

  const maxQty = Math.max(1, ...products.map((p: any) => p.total_quantity || 0));

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Orders"
          value={orders.toLocaleString()}
          Icon={ShoppingBag}
          accent="violet"
        />
        <Stat
          label={`Total paid ${currency}`}
          value={total.toLocaleString()}
          hint="Final customer charges (incl. shipping + tax, after discounts)"
          Icon={Wallet}
          accent="emerald"
        />
        <Stat
          label={`Product revenue ${currency}`}
          value={subtotal.toLocaleString()}
          hint="Sum of line items (list price × qty)"
          Icon={Package}
          accent="indigo"
        />
        <Stat
          label="Products"
          value={products.length.toLocaleString()}
          hint={`${emailsMatched.toLocaleString()} emails matched`}
          Icon={Mail}
          accent="amber"
        />
      </section>

      <section className="ix-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">
              Products ({products.length})
            </h2>
            <p className="text-xs text-slate-500">
              Ranked by units sold · Revenue = list price × qty, before shipping/tax/discounts
            </p>
          </div>
        </div>
        {!products.length ? (
          <p className="text-sm text-slate-500">No products in matched orders.</p>
        ) : (
          <div className="space-y-3">
            {products.map((p: any) => {
              const pct = Math.round((p.total_quantity / maxQty) * 100);
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-slate-500 tabular-nums shrink-0 ml-3">
                      <span className="font-semibold text-slate-900">
                        {p.total_quantity}
                      </span>{' '}
                      unit{p.total_quantity !== 1 ? 's' : ''} ·{' '}
                      {p.total_revenue.toLocaleString()} {currency}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="ix-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold">Orders ({orderList.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left py-2.5 px-6 font-medium">Order #</th>
              <th className="text-left px-6 font-medium">Customer</th>
              <th className="text-right px-6 font-medium">Total ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {orderList.map((o: any, i: number) => (
              <tr key={`${o.order_number}-${i}`} className="border-t border-slate-100">
                <td className="py-2.5 px-6 font-mono text-indigo-600">
                  {o.order_number}
                </td>
                <td className="px-6">{o.customer_name}</td>
                <td className="px-6 text-right tabular-nums font-medium">
                  {o.total_amount.toLocaleString()}
                </td>
              </tr>
            ))}
            {!orderList.length && (
              <tr>
                <td colSpan={3} className="py-3 px-6 text-slate-500">
                  No orders matched.
                </td>
              </tr>
            )}
          </tbody>
          {orderList.length > 0 && (() => {
            const sum = orderList.reduce(
              (s: number, o: any) => s + (Number(o.total_amount) || 0),
              0
            );
            const mismatch = Math.abs(sum - total) > 0.01;
            return (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                <tr>
                  <td className="py-2.5 px-6" colSpan={2}>
                    Sum of {orderList.length} orders
                  </td>
                  <td className="py-2.5 px-6 text-right tabular-nums">
                    {Math.round(sum * 100) / 100 === sum
                      ? sum.toLocaleString()
                      : sum.toFixed(2)}
                  </td>
                </tr>
                {mismatch && (
                  <tr className="text-amber-700">
                    <td className="px-6 pb-2 text-xs font-normal" colSpan={3}>
                      ⚠ This sum differs from the KPI &ldquo;Total paid&rdquo; above by{' '}
                      {(sum - total).toLocaleString()} {currency}. Likely a
                      rounding issue in a stored order &mdash; re-run the rule to refresh.
                    </td>
                  </tr>
                )}
              </tfoot>
            );
          })()}
        </table>
      </section>
    </>
  );
}

type BucketStat = {
  key: string;
  label: string;
  reservation_count: number;
  nights: number;
  total_payout: number;
};

function BeithadyView({
  out,
  emailsMatched,
}: {
  out: any;
  emailsMatched: number;
}) {
  const reservations: number = out?.reservation_count ?? 0;
  const totalPayout: number = out?.total_payout ?? 0;
  const totalNights: number = out?.total_nights ?? 0;
  const totalGuests: number = out?.total_guests ?? 0;
  const totalGuestPaid: number = out?.total_guest_paid ?? 0;
  const avgNights: number = out?.avg_nights_per_booking ?? 0;
  const avgRate: number = out?.avg_rate_per_night ?? 0;
  const avgPayout: number = out?.avg_payout_per_booking ?? 0;
  const avgLeadTime: number | null = out?.avg_lead_time_days ?? null;
  const uniqueGuests: number = out?.unique_guests ?? 0;
  const uniqueListings: number = out?.unique_listings ?? (out?.by_listing?.length ?? 0);
  const uniqueBuildings: number = out?.unique_buildings ?? (out?.by_building?.length ?? 0);
  const currency: string = out?.currency || 'USD';
  const byChannel: BucketStat[] = out?.by_channel || [];
  const byBuilding: BucketStat[] = out?.by_building || [];
  const byBedrooms: BucketStat[] = out?.by_bedrooms || [];
  const byListing: BucketStat[] = out?.by_listing || [];
  const bookings: any[] = out?.bookings || [];
  const topListing: BucketStat | null = out?.top_listing || byListing[0] || null;
  const topBuilding: BucketStat | null = out?.top_building || byBuilding[0] || null;
  const topBedrooms: BucketStat | null = out?.top_bedrooms || byBedrooms[0] || null;
  const topChannel: BucketStat | null = out?.top_channel || byChannel[0] || null;

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Reservations"
          value={reservations.toLocaleString()}
          hint={`${emailsMatched.toLocaleString()} emails matched`}
          Icon={BedDouble}
          accent="violet"
        />
        <Stat
          label={`Total payout ${currency}`}
          value={Number(totalPayout).toLocaleString()}
          hint="After commission, across all bookings"
          Icon={Wallet}
          accent="emerald"
        />
        <Stat
          label="Nights reserved"
          value={totalNights.toLocaleString()}
          hint={`${totalGuests.toLocaleString()} total guests · ${uniqueGuests.toLocaleString()} unique`}
          Icon={Moon}
          accent="indigo"
        />
        <Stat
          label="Buildings"
          value={uniqueBuildings.toLocaleString()}
          hint={`${uniqueListings.toLocaleString()} distinct listings`}
          Icon={Building2}
          accent="amber"
        />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label={`Avg payout ${currency}`}
          value={Number(avgPayout).toLocaleString()}
          hint="Per reservation"
          Icon={TrendingUp}
          accent="emerald"
        />
        <Stat
          label={`Avg rate/night ${currency}`}
          value={Number(avgRate).toLocaleString()}
          hint="Across all bookings"
          Icon={Wallet}
          accent="indigo"
        />
        <Stat
          label="Avg nights/booking"
          value={Number(avgNights).toLocaleString()}
          hint="Length of stay"
          Icon={Moon}
          accent="violet"
        />
        <Stat
          label="Avg lead time"
          value={avgLeadTime != null ? `${avgLeadTime.toLocaleString()} d` : '—'}
          hint="Days from booking email to check-in"
          Icon={CalendarClock}
          accent="amber"
        />
      </section>

      {(topListing || topBuilding || topBedrooms || topChannel) && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HighlightCard
            title="Top apartment"
            label={topListing?.label || '—'}
            value={
              topListing
                ? `${topListing.reservation_count} reservation${topListing.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            sub={
              topListing
                ? `${topListing.nights} nights · ${topListing.total_payout.toLocaleString()} ${currency}`
                : ''
            }
            Icon={Star}
            tint="bg-rose-50 text-rose-600"
          />
          <HighlightCard
            title="Top building"
            label={topBuilding?.label || '—'}
            value={
              topBuilding
                ? `${topBuilding.reservation_count} reservation${topBuilding.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            sub={
              topBuilding
                ? `${topBuilding.nights} nights · ${topBuilding.total_payout.toLocaleString()} ${currency}`
                : ''
            }
            Icon={Building2}
            tint="bg-indigo-50 text-indigo-600"
          />
          <HighlightCard
            title="Top bedroom count"
            label={topBedrooms?.label || '—'}
            value={
              topBedrooms
                ? `${topBedrooms.reservation_count} reservation${topBedrooms.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            sub={
              topBedrooms
                ? `${topBedrooms.nights} nights · ${topBedrooms.total_payout.toLocaleString()} ${currency}`
                : ''
            }
            Icon={BedDouble}
            tint="bg-violet-50 text-violet-600"
          />
          <HighlightCard
            title="Top channel"
            label={topChannel?.label || '—'}
            value={
              topChannel
                ? `${topChannel.reservation_count} reservation${topChannel.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            sub={
              topChannel
                ? `${topChannel.nights} nights · ${topChannel.total_payout.toLocaleString()} ${currency}`
                : ''
            }
            Icon={Globe2}
            tint="bg-emerald-50 text-emerald-600"
          />
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BucketCard
          title={`Bookings by channel (${byChannel.length})`}
          hint="Where the reservation came from (Airbnb, Booking.com, etc.)"
          items={byChannel}
          currency={currency}
          accent="emerald"
        />
        <BucketCard
          title={`Bookings by building (${byBuilding.length})`}
          hint="First dash-separated segment of listing code"
          items={byBuilding}
          currency={currency}
          accent="indigo"
        />
        <BucketCard
          title={`Bookings by bedroom count (${byBedrooms.length})`}
          hint="Derived from listing code/name (e.g. 3BR)"
          items={byBedrooms}
          currency={currency}
          accent="violet"
        />
        <BucketCard
          title={`Bookings by listing (${byListing.length})`}
          hint="Per-unit reservation ranking (top 50)"
          items={byListing}
          currency={currency}
          accent="rose"
        />
      </section>

      <section className="ix-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Reservations ({bookings.length})</h2>
          <p className="text-xs text-slate-500">
            Guest Paid: {Number(totalGuestPaid).toLocaleString()} {currency} · Total Payout: {Number(totalPayout).toLocaleString()} {currency}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Booking</th>
                <th className="text-left px-4 font-medium">Channel</th>
                <th className="text-left px-4 font-medium">Listing</th>
                <th className="text-left px-4 font-medium">Bldg</th>
                <th className="text-left px-4 font-medium">Guest</th>
                <th className="text-left px-4 font-medium">Check-in</th>
                <th className="text-left px-4 font-medium">Check-out</th>
                <th className="text-right px-4 font-medium">Nights</th>
                <th className="text-right px-4 font-medium">Guests</th>
                <th className="text-right px-4 font-medium">Rate</th>
                <th className="text-right px-4 font-medium">Payout ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b: any, i: number) => (
                <tr key={`${b.booking_id}-${i}`} className="border-t border-slate-100">
                  <td className="py-2.5 px-4 font-mono text-xs text-indigo-600">
                    {b.booking_id}
                  </td>
                  <td className="px-4">{b.channel}</td>
                  <td className="px-4 max-w-[200px] truncate" title={b.listing_code}>
                    {b.listing_code}
                  </td>
                  <td className="px-4 font-mono text-xs">{b.building_code}</td>
                  <td className="px-4">{b.guest_name}</td>
                  <td className="px-4 whitespace-nowrap">{b.check_in_date}</td>
                  <td className="px-4 whitespace-nowrap">{b.check_out_date}</td>
                  <td className="px-4 text-right tabular-nums">{b.nights}</td>
                  <td className="px-4 text-right tabular-nums">{b.guests}</td>
                  <td className="px-4 text-right tabular-nums">
                    {Number(b.rate_per_night || 0).toLocaleString()}
                  </td>
                  <td className="px-4 text-right tabular-nums font-medium">
                    {Number(b.total_payout || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!bookings.length && (
                <tr>
                  <td colSpan={11} className="py-3 px-4 text-slate-500">
                    No reservations matched.
                  </td>
                </tr>
              )}
            </tbody>
            {bookings.length > 0 && (() => {
              const sumPayout = bookings.reduce(
                (s: number, b: any) => s + (Number(b.total_payout) || 0),
                0
              );
              const sumNights = bookings.reduce(
                (s: number, b: any) => s + (Number(b.nights) || 0),
                0
              );
              const mismatch = Math.abs(sumPayout - totalPayout) > 0.01;
              return (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <tr>
                    <td className="py-2.5 px-4" colSpan={7}>
                      Sum of {bookings.length} reservations
                    </td>
                    <td className="px-4 text-right tabular-nums">{sumNights}</td>
                    <td className="px-4" colSpan={2}></td>
                    <td className="px-4 text-right tabular-nums">
                      {Math.round(sumPayout * 100) / 100 === sumPayout
                        ? sumPayout.toLocaleString()
                        : sumPayout.toFixed(2)}
                    </td>
                  </tr>
                  {mismatch && (
                    <tr className="text-amber-700">
                      <td className="px-4 pb-2 text-xs font-normal" colSpan={11}>
                        ⚠ Sum differs from KPI Total payout by{' '}
                        {(sumPayout - totalPayout).toLocaleString()} {currency}.
                      </td>
                    </tr>
                  )}
                </tfoot>
              );
            })()}
          </table>
        </div>
      </section>

      <section className="ix-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold">Guests ({uniqueGuests})</h2>
          <p className="text-xs text-slate-500">Repeat guests grouped by name</p>
        </div>
        <GuestTable bookings={bookings} currency={currency} />
      </section>
    </>
  );
}

function HighlightCard({
  title,
  label,
  value,
  sub,
  Icon,
  tint,
}: {
  title: string;
  label: string;
  value: string;
  sub?: string;
  Icon: any;
  tint: string;
}) {
  return (
    <div className="ix-card p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg inline-flex items-center justify-center ${tint}`}>
          <Icon size={18} />
        </div>
        <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          {title}
        </div>
      </div>
      <div className="mt-3 font-semibold truncate" title={label}>
        {label}
      </div>
      <div className="text-sm text-slate-700 tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function BucketCard({
  title,
  hint,
  items,
  currency,
  accent,
}: {
  title: string;
  hint: string;
  items: BucketStat[];
  currency: string;
  accent: 'emerald' | 'indigo' | 'violet' | 'rose';
}) {
  const max = Math.max(1, ...items.map(i => i.reservation_count));
  const barClass: Record<typeof accent, string> = {
    emerald: 'from-emerald-500 to-teal-500',
    indigo: 'from-indigo-500 to-violet-500',
    violet: 'from-violet-500 to-fuchsia-500',
    rose: 'from-rose-500 to-pink-500',
  };
  return (
    <div className="ix-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      {!items.length ? (
        <p className="text-sm text-slate-500">No data.</p>
      ) : (
        <div className="space-y-3">
          {items.map(b => {
            const pct = Math.round((b.reservation_count / max) * 100);
            return (
              <div key={b.key}>
                <div className="flex items-center justify-between text-sm mb-1 gap-3">
                  <div className="font-medium truncate" title={b.label}>
                    {b.label}
                  </div>
                  <div className="text-slate-500 tabular-nums shrink-0 text-right">
                    <span className="font-semibold text-slate-900">
                      {b.reservation_count}
                    </span>{' '}
                    res · {b.nights}n · {b.total_payout.toLocaleString()} {currency}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${barClass[accent]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuestTable({
  bookings,
  currency,
}: {
  bookings: any[];
  currency: string;
}) {
  const map = new Map<
    string,
    { name: string; bookings: number; nights: number; payout: number; lastCheckIn: string | null }
  >();
  for (const b of bookings) {
    const key = (b.guest_name || 'Unknown').trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.bookings += 1;
      existing.nights += Number(b.nights) || 0;
      existing.payout += Number(b.total_payout) || 0;
      if (b.check_in_date && (!existing.lastCheckIn || b.check_in_date > existing.lastCheckIn)) {
        existing.lastCheckIn = b.check_in_date;
      }
    } else {
      map.set(key, {
        name: b.guest_name || 'Unknown',
        bookings: 1,
        nights: Number(b.nights) || 0,
        payout: Number(b.total_payout) || 0,
        lastCheckIn: b.check_in_date || null,
      });
    }
  }
  const rows = Array.from(map.values()).sort((a, b) => b.bookings - a.bookings || b.payout - a.payout);
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-slate-600">
        <tr>
          <th className="text-left py-2.5 px-6 font-medium">Guest</th>
          <th className="text-right px-6 font-medium">Bookings</th>
          <th className="text-right px-6 font-medium">Nights</th>
          <th className="text-right px-6 font-medium">Payout ({currency})</th>
          <th className="text-left px-6 font-medium">Last check-in</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 100).map((g, i) => (
          <tr key={`${g.name}-${i}`} className="border-t border-slate-100">
            <td className="py-2.5 px-6 flex items-center gap-2">
              <Users size={14} className="text-slate-400" /> {g.name}
            </td>
            <td className="px-6 text-right tabular-nums">{g.bookings}</td>
            <td className="px-6 text-right tabular-nums">{g.nights}</td>
            <td className="px-6 text-right tabular-nums font-medium">
              {g.payout.toLocaleString()}
            </td>
            <td className="px-6 text-xs text-slate-500">{g.lastCheckIn || '—'}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={5} className="py-3 px-6 text-slate-500">
              No guests yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
    running: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const cls = map[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}
