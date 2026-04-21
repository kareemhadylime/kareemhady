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
  CalendarDays,
  DoorOpen,
  Hourglass,
  BookOpen,
  AlertTriangle,
  GitCompare,
  Plane,
  Banknote,
  Star,
  ThumbsUp,
  ThumbsDown,
  Flag,
  MessageSquareWarning,
  Lightbulb,
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
import { BEITHADY_BUILDINGS, classifyBuilding } from '@/lib/rules/aggregators/beithady-booking';

const fmt = (n: number | string | null | undefined): string =>
  Math.round(Number(n) || 0).toLocaleString();

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
  const isPayout = actionType === 'beithady_payout_aggregate';
  const isReviews = actionType === 'beithady_reviews_aggregate';

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

            {(out?.mark_errors ?? 0) > 0 && (out?.marked_read ?? 0) === 0 && (
              <div className="ix-card p-4 border-rose-300 bg-rose-50 text-rose-800 text-sm">
                <div className="flex items-start gap-2">
                  <XCircle size={18} className="shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold">
                      None of {out.mark_errors} email{out.mark_errors !== 1 ? 's' : ''} could be marked as read.
                    </div>
                    <div className="text-xs">
                      The connected mailbox{' '}
                      <span className="font-mono">
                        {(rule as any).account?.email || 'account'}
                      </span>{' '}
                      is authorized for <span className="font-mono">gmail.readonly</span> but not{' '}
                      <span className="font-mono">gmail.modify</span>. Go to{' '}
                      <Link href="/admin/accounts" className="ix-link underline font-medium">
                        /admin/accounts
                      </Link>{' '}
                      and click <b>Connect</b> on that mailbox to re-run the OAuth flow with the updated scopes.
                    </div>
                    {out.mark_error_reason && (
                      <div className="text-[11px] text-rose-700/80 mt-1">
                        Sample error: <span className="font-mono">{out.mark_error_reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isReviews ? (
              <BeithadyReviewView out={out} emailsMatched={latest.input_email_count ?? 0} />
            ) : isPayout ? (
              <BeithadyPayoutView out={out} emailsMatched={latest.input_email_count ?? 0} />
            ) : isBeithady ? (
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
                      {isReviews
                        ? 'Reviews'
                        : isPayout
                          ? 'Total AED'
                          : isBeithady
                            ? 'Reservations'
                            : 'Orders'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs?.map(r => {
                    const tr = (r.output as any)?.time_range;
                    const count = isReviews
                      ? (r.output as any)?.total_reviews
                      : isPayout
                        ? Math.round(Number((r.output as any)?.total_aed) || 0)
                        : isBeithady
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
  const CURRENCY = 'USD';
  const reservations: number = out?.reservation_count ?? 0;
  const totalPayout: number = out?.total_payout ?? 0;
  const totalNights: number = out?.total_nights ?? 0;
  const totalGuests: number = out?.total_guests ?? 0;
  const totalGuestPaid: number = out?.total_guest_paid ?? 0;
  const avgNights: number = out?.avg_nights_per_booking ?? 0;
  const avgPayout: number = out?.avg_payout_per_booking ?? 0;
  const avgLeadTime: number | null = out?.avg_lead_time_days ?? null;
  const uniqueGuests: number = out?.unique_guests ?? 0;
  const uniqueBuildings: number = out?.unique_buildings ?? (out?.by_building?.length ?? 0);
  const byChannel: BucketStat[] = out?.by_channel || [];
  const byBuilding: BucketStat[] = out?.by_building || [];
  const byBedrooms: BucketStat[] = out?.by_bedrooms || [];
  const byListing: BucketStat[] = out?.by_listing || [];
  const bookings: any[] = out?.bookings || [];
  const topListing: BucketStat | null = out?.top_listing || byListing[0] || null;
  const topBuilding: BucketStat | null = out?.top_building || byBuilding[0] || null;
  const topBedrooms: BucketStat | null = out?.top_bedrooms || byBedrooms[0] || null;
  const timeRange = out?.time_range as
    | { from: string; to: string }
    | undefined;

  const adr = totalNights > 0 ? totalPayout / totalNights : 0;
  const rangeDays = timeRange
    ? Math.max(
        1,
        Math.round(
          (Date.parse(timeRange.to) - Date.parse(timeRange.from)) /
            (24 * 3600 * 1000)
        )
      )
    : 0;
  const bookingPace = rangeDays > 0 ? reservations / rangeDays : 0;
  const avgListRate =
    bookings.length > 0
      ? bookings.reduce((s: number, b: any) => s + (Number(b.rate_per_night) || 0), 0) /
        bookings.length
      : 0;

  const stayBuckets = bucketStayLengths(bookings);
  const leadBuckets = bucketLeadTimes(bookings, timeRange?.from);
  const checkInByMonth = groupByCheckInMonth(bookings);
  const checkInByWeekday = groupByCheckInWeekday(bookings);

  return (
    <>
      <section
        className="relative rounded-2xl overflow-hidden border border-rose-200/60 shadow-sm"
        style={{
          background:
            'linear-gradient(135deg, rgba(244,63,94,0.08) 0%, rgba(236,72,153,0.06) 45%, rgba(251,146,60,0.08) 100%)',
        }}
      >
        <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 opacity-20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-gradient-to-br from-pink-400 to-violet-400 opacity-15 blur-3xl pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-rose-700 text-xs uppercase tracking-wider font-semibold">
            <BedDouble size={14} /> Beithady · Reservations performance
          </div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <HeroStat
              label="Reservations"
              value={reservations.toLocaleString()}
              sub={`${emailsMatched.toLocaleString()} booking emails · ${uniqueGuests.toLocaleString()} unique guests`}
              Icon={BedDouble}
            />
            <HeroStat
              label={`Total payout (${CURRENCY})`}
              value={fmt(totalPayout)}
              sub={`After commission · avg ${fmt(avgPayout)} / res`}
              Icon={Wallet}
            />
            <HeroStat
              label="Nights reserved"
              value={totalNights.toLocaleString()}
              sub={`${totalGuests.toLocaleString()} total guests · avg ${Number(avgNights).toFixed(1)} nights / stay`}
              Icon={Moon}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Most reserved"
          hint="Top performers across apartments, buildings, and bedroom counts during this period."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
          <TrophyCard
            rank="Most reserved apartment"
            name={topListing?.label || '—'}
            primary={
              topListing
                ? `${topListing.reservation_count} reservation${topListing.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            secondary={
              topListing
                ? `${topListing.nights} nights · ${fmt(topListing.total_payout)} ${CURRENCY}`
                : ''
            }
            Icon={DoorOpen}
            palette="rose"
          />
          <TrophyCard
            rank="Most reserved building"
            name={topBuilding ? classifyBuilding(topBuilding.label) : '—'}
            primary={
              topBuilding
                ? `${topBuilding.reservation_count} reservation${topBuilding.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            secondary={
              topBuilding
                ? `${BEITHADY_BUILDINGS[classifyBuilding(topBuilding.label)]?.description ? BEITHADY_BUILDINGS[classifyBuilding(topBuilding.label)]?.description + ' · ' : ''}${topBuilding.nights} nights · ${fmt(topBuilding.total_payout)} ${CURRENCY}`
                : ''
            }
            Icon={Building2}
            palette="indigo"
          />
          <TrophyCard
            rank="Most reserved bedroom count"
            name={topBedrooms?.label || '—'}
            primary={
              topBedrooms
                ? `${topBedrooms.reservation_count} reservation${topBedrooms.reservation_count !== 1 ? 's' : ''}`
                : 'No bookings yet'
            }
            secondary={
              topBedrooms
                ? `${topBedrooms.nights} nights · ${fmt(topBedrooms.total_payout)} ${CURRENCY}`
                : ''
            }
            Icon={BedDouble}
            palette="violet"
          />
        </div>
      </section>

      <section>
        <SectionHeader
          title="Airbnb ↔ Guesty reconciliation"
          hint="Cross-checks Airbnb &ldquo;Reservation confirmed&rdquo; emails (relayed by Guesty to guesty@beithady.com) against the Guesty NEW BOOKING emails. A mismatch means Guesty didn't relay the booking — go into Guesty and re-sync."
        />
        <ReconciliationPanel out={out} />
      </section>

      <section>
        <SectionHeader
          title="Booking received from"
          hint="Channel mix for this period. Share is calculated on reservation count."
        />
        <ChannelMix items={byChannel} totalReservations={reservations} />
      </section>

      <section>
        <SectionHeader
          title={`Reservations in each building (${uniqueBuildings})`}
          hint="Mapping: BH-26* → BH-26 · BH-435* → BH-435 · BH-73* → BH-73 · BH-<3 digits>-xx → BH-OK (scattered One Kattameya) · BH-MG → BH-MG (Heliopolis single)."
        />
        <BuildingTable items={byBuilding} totalRes={reservations} />
      </section>

      <section>
        <SectionHeader
          title="Performance"
          hint="Operational KPIs to gauge the period at a glance."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <Stat
            label={`ADR ${CURRENCY}`}
            value={fmt(adr)}
            hint="Average Daily Rate — total payout / nights"
            Icon={TrendingUp}
            accent="emerald"
          />
          <Stat
            label={`Avg list rate/night ${CURRENCY}`}
            value={fmt(avgListRate)}
            hint="Mean of nightly rate on the booking email"
            Icon={Wallet}
            accent="indigo"
          />
          <Stat
            label="Booking pace"
            value={bookingPace ? bookingPace.toFixed(2) : '—'}
            hint={rangeDays ? `Reservations / day across ${rangeDays} d` : 'Run a range first'}
            Icon={CalendarClock}
            accent="amber"
          />
          <Stat
            label="Avg lead time"
            value={avgLeadTime != null ? `${avgLeadTime.toLocaleString()} d` : '—'}
            hint="Days from booking email to check-in"
            Icon={Hourglass}
            accent="rose"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BucketPanel
          title="Length of stay"
          hint="Short ≤2 · Mid 3-7 · Long 8-14 · Extended 15+"
          items={stayBuckets}
          Icon={Moon}
          palette="violet"
        />
        <BucketPanel
          title="Lead time from email to check-in"
          hint="Last-minute <1 day · Short 1-7 · Medium 8-30 · Far 31-90 · Distant 90+"
          items={leadBuckets}
          Icon={Hourglass}
          palette="indigo"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CheckInMonthPanel items={checkInByMonth} />
        <CheckInWeekdayPanel items={checkInByWeekday} />
      </section>

      <section>
        <SectionHeader
          title={`By bedroom count (${byBedrooms.length})`}
          hint="How demand splits across unit sizes."
        />
        <div className="mt-3">
          <BucketBars items={byBedrooms} palette="rose" />
        </div>
      </section>

      <section>
        <SectionHeader
          title={`Top listings (${byListing.length})`}
          hint="Individual apartments ranked by reservation count — full per-booking detail below."
        />
        <div className="mt-3">
          <BucketBars items={byListing.slice(0, 15)} palette="emerald" />
        </div>
      </section>

      <section className="ix-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BookOpen size={18} className="text-rose-500" />
              Reservations ({bookings.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Guest paid (ledger): {fmt(totalGuestPaid)} {CURRENCY}
              {' · '}
              Total payout (after commission): {fmt(totalPayout)} {CURRENCY}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rose-50/60 text-rose-900">
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
                <th className="text-right px-4 font-medium">Payout ({CURRENCY})</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b: any, i: number) => {
                const bldgNormalized = normalizeBuildingCode(b);
                return (
                  <tr key={`${b.booking_id}-${i}`} className="border-t border-slate-100 hover:bg-rose-50/30">
                    <td className="py-2.5 px-4 font-mono text-xs text-rose-700">
                      {b.booking_id}
                    </td>
                    <td className="px-4">
                      <ChannelBadge name={b.channel} />
                    </td>
                    <td className="px-4 max-w-[220px] truncate font-mono text-xs" title={b.listing_code}>
                      {b.listing_code}
                    </td>
                    <td className="px-4 font-mono text-xs font-semibold">{bldgNormalized}</td>
                    <td className="px-4">{b.guest_name}</td>
                    <td className="px-4 whitespace-nowrap">{b.check_in_date}</td>
                    <td className="px-4 whitespace-nowrap">{b.check_out_date}</td>
                    <td className="px-4 text-right tabular-nums">{b.nights}</td>
                    <td className="px-4 text-right tabular-nums">{b.guests}</td>
                    <td className="px-4 text-right tabular-nums">
                      {fmt(b.rate_per_night)}
                    </td>
                    <td className="px-4 text-right tabular-nums font-medium">
                      {fmt(b.total_payout)}
                    </td>
                  </tr>
                );
              })}
              {!bookings.length && (
                <tr>
                  <td colSpan={11} className="py-6 px-4 text-slate-500 text-center">
                    No reservations matched the selected range.
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
              const sumGuests = bookings.reduce(
                (s: number, b: any) => s + (Number(b.guests) || 0),
                0
              );
              const mismatch = Math.abs(sumPayout - totalPayout) > 0.01;
              return (
                <tfoot className="bg-rose-50/40 border-t-2 border-rose-200 font-semibold">
                  <tr>
                    <td className="py-2.5 px-4" colSpan={7}>
                      Total · {bookings.length} reservations
                    </td>
                    <td className="px-4 text-right tabular-nums">{sumNights}</td>
                    <td className="px-4 text-right tabular-nums">{sumGuests}</td>
                    <td className="px-4" />
                    <td className="px-4 text-right tabular-nums">
                      {fmt(sumPayout)}
                    </td>
                  </tr>
                  {mismatch && (
                    <tr className="text-amber-700">
                      <td className="px-4 pb-2 text-xs font-normal" colSpan={11}>
                        ⚠ Sum differs from KPI Total payout by{' '}
                        {fmt(sumPayout - totalPayout)} {CURRENCY}. Re-run the rule to refresh stored totals.
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
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users size={18} className="text-rose-500" />
            Guests ({uniqueGuests})
          </h2>
          <p className="text-xs text-slate-500">Grouped by name — use for repeat-guest intel.</p>
        </div>
        <GuestTable bookings={bookings} />
      </section>
    </>
  );
}

// Re-apply the canonical classifier at render time so historical rule_runs
// (stored before the new mapping rules) display the correct building.
// Uses the listing_code when available (which carries the full prefix); falls
// back to the stored building_code otherwise.
function normalizeBuildingCode(b: {
  building_code?: string;
  listing_code?: string;
}): string {
  if (b.listing_code) return classifyBuilding(b.listing_code);
  return classifyBuilding(b.building_code || '');
}

function BeithadyPayoutView({
  out,
  emailsMatched,
}: {
  out: any;
  emailsMatched: number;
}) {
  const totalAed: number = out?.total_aed ?? 0;
  const airbnbAed: number = out?.airbnb_total_aed ?? 0;
  const stripeAed: number = out?.stripe_total_aed ?? 0;
  const airbnbCount: number = out?.airbnb_email_count ?? 0;
  const stripeCount: number = out?.stripe_email_count ?? 0;
  const airbnbLineItems: number = out?.airbnb_line_items_count ?? 0;
  const airbnbUnique: number = out?.airbnb_unique_reservations ?? 0;
  const airbnbUsd: number = out?.airbnb_total_usd ?? 0;
  const refundCount: number = out?.refund_count ?? 0;
  const refundUsd: number = out?.refund_total_usd ?? 0;
  const lineItems: Array<{
    confirmation_code: string;
    guest_name: string;
    listing_name: string | null;
    booking_type: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    amount: number;
    currency: string;
    is_refund: boolean;
    building_code: string | null;
    email_sent_date: string | null;
  }> = out?.airbnb_line_items || [];
  const airbnbPayoutsSummary: Array<{
    email_date: string | null;
    total_aed: number;
    total_usd_from_items: number;
    sent_date: string | null;
    arrival_date: string | null;
    line_item_count: number;
    bank_iban_last4: string | null;
  }> = out?.airbnb_payouts || [];
  const stripePayouts: Array<{
    email_date: string | null;
    amount: number;
    currency: string;
    arrival_date: string | null;
    bank_name: string | null;
    bank_last4: string | null;
    payout_id: string | null;
  }> = out?.stripe_payouts || [];
  const byMonth: Array<{
    month: string;
    label: string;
    airbnb_aed: number;
    stripe_aed: number;
    total_aed: number;
    count: number;
  }> = out?.by_month || [];
  const byBuilding: Array<{
    key: string;
    line_item_count: number;
    unique_reservations: number;
    total_usd: number;
  }> = out?.by_building || [];

  const airbnbShare = totalAed > 0 ? (airbnbAed / totalAed) * 100 : 0;
  const stripeShare = totalAed > 0 ? (stripeAed / totalAed) * 100 : 0;
  const refunds = lineItems.filter(l => l.is_refund);
  const refundables = lineItems.filter(l => !l.is_refund);

  return (
    <>
      <section
        className="relative rounded-2xl overflow-hidden border border-emerald-200/60 shadow-sm"
        style={{
          background:
            'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(99,102,241,0.06) 45%, rgba(139,92,246,0.08) 100%)',
        }}
      >
        <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-400 opacity-20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 opacity-15 blur-3xl pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-emerald-700 text-xs uppercase tracking-wider font-semibold">
            <Banknote size={14} /> Beithady · Payouts received
          </div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
            <HeroStat
              label="Total payouts AED"
              value={fmt(totalAed)}
              sub={`${emailsMatched.toLocaleString()} payout emails processed`}
              Icon={Banknote}
            />
            <HeroStat
              label="Airbnb AED"
              value={fmt(airbnbAed)}
              sub={`${airbnbCount} payouts · ${airbnbLineItems} line items`}
              Icon={Plane}
            />
            <HeroStat
              label="Stripe AED"
              value={fmt(stripeAed)}
              sub={`${stripeCount} payouts · Booking.com / Expedia / Manual`}
              Icon={Wallet}
            />
            <HeroStat
              label="Unique reservations paid"
              value={airbnbUnique.toLocaleString()}
              sub={`Airbnb line items · ${fmt(airbnbUsd)} USD · ${refundCount} refunds (${fmt(refundUsd)} USD)`}
              Icon={CheckCircle2}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Bank destinations"
          hint="Where the money lands. Airbnb pays in AED to Beithady Hospitality FZCO; Stripe settles the non-Airbnb channels to the same IBAN via BANQUE MISR."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div className="ix-card p-5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Airbnb → Bank
            </div>
            <div className="mt-1 font-mono font-bold">Beithady Hospitality FZCO</div>
            <div className="text-sm text-slate-600">IBAN ending 8439 · AED</div>
          </div>
          <div className="ix-card p-5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Stripe → Bank
            </div>
            <div className="mt-1 font-mono font-bold">BANQUE MISR ••••8439</div>
            <div className="text-sm text-slate-600">AED payouts (Booking.com · Expedia · Manual)</div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Source split"
          hint="Share of AED received by platform. Stripe routes Booking.com + Expedia + Manual payouts; Airbnb pays direct. Manual payouts at hotel (cash) don't appear in either email — track those separately."
        />
        <div className="ix-card p-6 mt-3 space-y-4">
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-pink-500"
              style={{ width: `${airbnbShare}%` }}
              title={`Airbnb: ${fmt(airbnbAed)} AED (${airbnbShare.toFixed(1)}%)`}
            />
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-blue-500"
              style={{ width: `${stripeShare}%` }}
              title={`Stripe: ${fmt(stripeAed)} AED (${stripeShare.toFixed(1)}%)`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500" />
                Airbnb
              </span>
              <span className="text-slate-600 tabular-nums text-xs">
                {airbnbCount} payouts · {fmt(airbnbAed)} AED · {airbnbShare.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500" />
                Stripe
              </span>
              <span className="text-slate-600 tabular-nums text-xs">
                {stripeCount} payouts · {fmt(stripeAed)} AED · {stripeShare.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Cash flow by month"
          hint="Payouts grouped by the date the email arrived in inbox (proxy for when the money was sent)."
        />
        <PayoutMonthChart items={byMonth} />
      </section>

      {byBuilding.length > 0 && (
        <section>
          <SectionHeader
            title="Airbnb payouts by building"
            hint="Building is inferred from BH-code in the listing name when present. Rows labelled UNKNOWN couldn't be attributed from the Airbnb listing alone."
          />
          <div className="ix-card overflow-hidden mt-3">
            <table className="w-full text-sm">
              <thead className="bg-emerald-50/60 text-emerald-900">
                <tr>
                  <th className="text-left py-2.5 px-6 font-medium">Building</th>
                  <th className="text-right px-6 font-medium">Line items</th>
                  <th className="text-right px-6 font-medium">Unique reservations</th>
                  <th className="text-right px-6 font-medium">Total USD</th>
                </tr>
              </thead>
              <tbody>
                {byBuilding.map(b => (
                  <tr key={b.key} className="border-t border-slate-100">
                    <td className="py-2.5 px-6 font-mono font-semibold">{b.key}</td>
                    <td className="px-6 text-right tabular-nums">{b.line_item_count}</td>
                    <td className="px-6 text-right tabular-nums">{b.unique_reservations}</td>
                    <td className="px-6 text-right tabular-nums font-medium">
                      {fmt(b.total_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title={`Airbnb payouts (${airbnbPayoutsSummary.length})`}
          hint="Each payout email's header — total AED + line item count + dates."
        />
        <div className="ix-card overflow-hidden mt-3">
          <table className="w-full text-sm">
            <thead className="bg-rose-50/60 text-rose-900">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Email date</th>
                <th className="text-left px-4 font-medium">Sent</th>
                <th className="text-left px-4 font-medium">Arrival</th>
                <th className="text-right px-4 font-medium">Items</th>
                <th className="text-right px-4 font-medium">USD in items</th>
                <th className="text-right px-4 font-medium">Payout AED</th>
                <th className="text-left px-4 font-medium">IBAN</th>
              </tr>
            </thead>
            <tbody>
              {airbnbPayoutsSummary.map((p, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-rose-50/30">
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {p.email_date ? new Date(p.email_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 whitespace-nowrap">{p.sent_date || '—'}</td>
                  <td className="px-4 whitespace-nowrap">{p.arrival_date || '—'}</td>
                  <td className="px-4 text-right tabular-nums">{p.line_item_count}</td>
                  <td className="px-4 text-right tabular-nums">
                    {fmt(p.total_usd_from_items)}
                  </td>
                  <td className="px-4 text-right tabular-nums font-medium">
                    {fmt(p.total_aed)}
                  </td>
                  <td className="px-4 font-mono text-xs">
                    {p.bank_iban_last4 ? `••${p.bank_iban_last4}` : '—'}
                  </td>
                </tr>
              ))}
              {!airbnbPayoutsSummary.length && (
                <tr>
                  <td colSpan={7} className="py-4 px-4 text-slate-500 text-center">
                    No Airbnb payouts in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeader
          title={`Airbnb line items (${refundables.length})`}
          hint="Per-reservation breakdown. Confirmation code matches the booking_id in the Beithady Guesty Bookings rule — use that for cross-rule reconciliation."
        />
        <div className="ix-card overflow-hidden mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-rose-50/60 text-rose-900">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Code</th>
                  <th className="text-left px-4 font-medium">Guest</th>
                  <th className="text-left px-4 font-medium">Type</th>
                  <th className="text-left px-4 font-medium">Listing</th>
                  <th className="text-left px-4 font-medium">Bldg</th>
                  <th className="text-left px-4 font-medium">Stay</th>
                  <th className="text-right px-4 font-medium">Amount (USD)</th>
                  <th className="text-left px-4 font-medium">Payout date</th>
                </tr>
              </thead>
              <tbody>
                {refundables.map((li, i) => (
                  <tr
                    key={`${li.confirmation_code}-${i}`}
                    className="border-t border-slate-100 hover:bg-rose-50/30"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-rose-700 font-semibold">
                      {li.confirmation_code}
                    </td>
                    <td className="px-4">{li.guest_name}</td>
                    <td className="px-4 text-xs">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {li.booking_type || '—'}
                      </span>
                    </td>
                    <td
                      className="px-4 max-w-[260px] truncate text-xs"
                      title={li.listing_name || undefined}
                    >
                      {li.listing_name || '—'}
                    </td>
                    <td className="px-4 font-mono text-xs font-semibold">
                      {li.building_code || '—'}
                    </td>
                    <td className="px-4 text-xs whitespace-nowrap">
                      {li.check_in_date && li.check_out_date
                        ? `${li.check_in_date} → ${li.check_out_date}`
                        : '—'}
                    </td>
                    <td className="px-4 text-right tabular-nums font-medium">
                      {fmt(li.amount)}
                    </td>
                    <td className="px-4 text-xs text-slate-500 whitespace-nowrap">
                      {li.email_sent_date || '—'}
                    </td>
                  </tr>
                ))}
                {!refundables.length && (
                  <tr>
                    <td colSpan={8} className="py-4 px-4 text-slate-500 text-center">
                      No Airbnb line items in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {refunds.length > 0 && (
        <section>
          <SectionHeader
            title={`Refunds / adjustments (${refunds.length})`}
            hint="Negative-amount rows deducted from the payout. Review and cross-reference with cancellation emails."
          />
          <div className="ix-card overflow-hidden mt-3 border-amber-200">
            <table className="w-full text-sm">
              <thead className="bg-amber-50/60 text-amber-900">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Code</th>
                  <th className="text-left px-4 font-medium">Guest</th>
                  <th className="text-left px-4 font-medium">Type</th>
                  <th className="text-left px-4 font-medium">Listing</th>
                  <th className="text-right px-4 font-medium">Amount (USD)</th>
                  <th className="text-left px-4 font-medium">Payout date</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((li, i) => (
                  <tr
                    key={`${li.confirmation_code}-refund-${i}`}
                    className="border-t border-amber-100 hover:bg-amber-50/30"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold">
                      {li.confirmation_code}
                    </td>
                    <td className="px-4">{li.guest_name}</td>
                    <td className="px-4 text-xs">{li.booking_type || '—'}</td>
                    <td
                      className="px-4 max-w-[260px] truncate text-xs"
                      title={li.listing_name || undefined}
                    >
                      {li.listing_name || '—'}
                    </td>
                    <td className="px-4 text-right tabular-nums font-medium text-amber-700">
                      {fmt(li.amount)}
                    </td>
                    <td className="px-4 text-xs text-slate-500 whitespace-nowrap">
                      {li.email_sent_date || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title={`Stripe payouts (${stripePayouts.length})`}
          hint="Bank-settled transfers. Stripe emails don't carry per-booking detail, so use the Payout ID in the Stripe dashboard to see which charges were included."
        />
        <div className="ix-card overflow-hidden mt-3">
          <table className="w-full text-sm">
            <thead className="bg-indigo-50/60 text-indigo-900">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Email date</th>
                <th className="text-left px-4 font-medium">Est. arrival</th>
                <th className="text-right px-4 font-medium">Amount AED</th>
                <th className="text-left px-4 font-medium">Bank</th>
                <th className="text-left px-4 font-medium">Payout ID</th>
              </tr>
            </thead>
            <tbody>
              {stripePayouts.map((p, i) => (
                <tr
                  key={p.payout_id || i}
                  className="border-t border-slate-100 hover:bg-indigo-50/30"
                >
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {p.email_date ? new Date(p.email_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 whitespace-nowrap">{p.arrival_date || '—'}</td>
                  <td className="px-4 text-right tabular-nums font-medium">
                    {fmt(p.amount)}
                  </td>
                  <td className="px-4 text-xs">
                    {p.bank_name ? `${p.bank_name}${p.bank_last4 ? ` ••${p.bank_last4}` : ''}` : '—'}
                  </td>
                  <td className="px-4 font-mono text-xs">{p.payout_id || '—'}</td>
                </tr>
              ))}
              {!stripePayouts.length && (
                <tr>
                  <td colSpan={5} className="py-4 px-4 text-slate-500 text-center">
                    No Stripe payouts in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PayoutMonthChart({
  items,
}: {
  items: Array<{
    month: string;
    label: string;
    airbnb_aed: number;
    stripe_aed: number;
    total_aed: number;
    count: number;
  }>;
}) {
  if (!items.length) {
    return (
      <div className="ix-card p-6 mt-3 text-center text-sm text-slate-500">
        No payouts in this range.
      </div>
    );
  }
  const max = Math.max(1, ...items.map(i => i.total_aed));
  return (
    <div className="ix-card p-6 mt-3">
      <div className="flex items-end gap-3 h-48">
        {items.map(i => {
          const airbnbPct = Math.round((i.airbnb_aed / max) * 100);
          const stripePct = Math.round((i.stripe_aed / max) * 100);
          return (
            <div
              key={i.month}
              className="flex-1 flex flex-col items-center justify-end gap-1 group"
              title={`${i.label}: AED ${fmt(i.total_aed)} total · Airbnb ${fmt(i.airbnb_aed)} · Stripe ${fmt(i.stripe_aed)}`}
            >
              <div className="text-[10px] font-semibold text-slate-700 tabular-nums">
                {fmt(i.total_aed)}
              </div>
              <div className="w-full flex flex-col-reverse">
                <div
                  className="w-full bg-gradient-to-t from-rose-500 to-pink-400"
                  style={{ height: `${Math.max(2, airbnbPct * 1.2)}px` }}
                />
                <div
                  className="w-full bg-gradient-to-t from-indigo-500 to-blue-400"
                  style={{ height: `${Math.max(2, stripePct * 1.2)}px` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 whitespace-nowrap">
                {i.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gradient-to-br from-rose-500 to-pink-500" />
          Airbnb
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gradient-to-br from-indigo-500 to-blue-500" />
          Stripe
        </span>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  Icon: any;
}) {
  return (
    <div className="relative">
      <div className="flex items-center gap-2 text-rose-700/80 text-[11px] uppercase tracking-wider font-semibold">
        <Icon size={14} /> {label}
      </div>
      <div className="text-5xl font-bold tracking-tight mt-2 text-slate-900 tabular-nums">
        {value}
      </div>
      {sub && <div className="text-xs text-slate-600 mt-2">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function TrophyCard({
  rank,
  name,
  primary,
  secondary,
  Icon,
  palette,
}: {
  rank: string;
  name: string;
  primary: string;
  secondary?: string;
  Icon: any;
  palette: 'rose' | 'indigo' | 'violet';
}) {
  const themes: Record<
    typeof palette,
    { bg: string; ring: string; text: string; chip: string; glow: string }
  > = {
    rose: {
      bg: 'from-rose-50 via-white to-pink-50',
      ring: 'ring-rose-200/70',
      text: 'text-rose-700',
      chip: 'bg-rose-100 text-rose-700',
      glow: 'from-rose-400 to-pink-500',
    },
    indigo: {
      bg: 'from-indigo-50 via-white to-blue-50',
      ring: 'ring-indigo-200/70',
      text: 'text-indigo-700',
      chip: 'bg-indigo-100 text-indigo-700',
      glow: 'from-indigo-400 to-violet-500',
    },
    violet: {
      bg: 'from-violet-50 via-white to-fuchsia-50',
      ring: 'ring-violet-200/70',
      text: 'text-violet-700',
      chip: 'bg-violet-100 text-violet-700',
      glow: 'from-violet-400 to-fuchsia-500',
    },
  };
  const t = themes[palette];
  return (
    <div
      className={`relative overflow-hidden rounded-xl ring-1 ${t.ring} bg-gradient-to-br ${t.bg} p-5`}
    >
      <div
        className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${t.glow} opacity-20 blur-2xl pointer-events-none`}
      />
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${t.chip}`}>
          {rank}
        </span>
        <Icon size={18} className={t.text} />
      </div>
      <div className="mt-4 font-mono text-lg font-bold truncate text-slate-900" title={name}>
        {name}
      </div>
      <div className={`text-sm font-semibold ${t.text} mt-1`}>{primary}</div>
      {secondary && <div className="text-xs text-slate-600 mt-0.5">{secondary}</div>}
    </div>
  );
}

function ChannelBadge({ name }: { name: string }) {
  const key = (name || '').toLowerCase();
  let cls = 'bg-slate-100 text-slate-700';
  if (key.includes('airbnb')) cls = 'bg-rose-100 text-rose-700';
  else if (key.includes('booking')) cls = 'bg-blue-100 text-blue-700';
  else if (key.includes('vrbo') || key.includes('expedia'))
    cls = 'bg-amber-100 text-amber-700';
  else if (key.includes('direct')) cls = 'bg-emerald-100 text-emerald-700';
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {name || 'Unknown'}
    </span>
  );
}

function ChannelMix({
  items,
  totalReservations,
}: {
  items: BucketStat[];
  totalReservations: number;
}) {
  if (!items.length) {
    return (
      <div className="ix-card p-6 mt-3 text-center text-sm text-slate-500">
        No channel data yet.
      </div>
    );
  }
  const colors = [
    'from-rose-500 to-pink-500',
    'from-indigo-500 to-blue-500',
    'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-500',
    'from-violet-500 to-fuchsia-500',
    'from-slate-500 to-slate-700',
  ];
  return (
    <div className="ix-card p-6 mt-3 space-y-4">
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
        {items.map((c, i) => {
          const pct = totalReservations
            ? (c.reservation_count / totalReservations) * 100
            : 0;
          return (
            <div
              key={c.key}
              className={`h-full bg-gradient-to-r ${colors[i % colors.length]}`}
              style={{ width: `${pct}%` }}
              title={`${c.label}: ${c.reservation_count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((c, i) => {
          const pct = totalReservations
            ? (c.reservation_count / totalReservations) * 100
            : 0;
          return (
            <div
              key={c.key}
              className="flex items-center justify-between text-sm gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br ${colors[i % colors.length]}`}
                />
                <ChannelBadge name={c.label} />
              </div>
              <div className="text-slate-600 tabular-nums text-right shrink-0 text-xs">
                <span className="font-semibold text-slate-900">
                  {c.reservation_count}
                </span>{' '}
                res · {pct.toFixed(1)}% · {c.nights}n ·{' '}
                {fmt(c.total_payout)} USD
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuildingTable({
  items,
  totalRes,
}: {
  items: BucketStat[];
  totalRes: number;
}) {
  if (!items.length) {
    return (
      <div className="ix-card p-6 mt-3 text-center text-sm text-slate-500">
        No buildings yet.
      </div>
    );
  }
  const knownCodes = Object.keys(BEITHADY_BUILDINGS);
  // Re-classify each bucket label so legacy rows (e.g. stored as "BH101") are
  // re-mapped to the correct canonical building (e.g. BH-OK) on render.
  const reclassified = new Map<string, BucketStat>();
  for (const i of items) {
    const key = classifyBuilding(i.label);
    const existing = reclassified.get(key);
    if (existing) {
      existing.reservation_count += i.reservation_count;
      existing.nights += i.nights;
      existing.total_payout += i.total_payout;
    } else {
      reclassified.set(key, {
        key,
        label: key,
        reservation_count: i.reservation_count,
        nights: i.nights,
        total_payout: i.total_payout,
      });
    }
  }
  const itemsByCode = reclassified;
  const rows: Array<{ item: BucketStat | null; code: string; description?: string }> = [];
  for (const code of knownCodes) {
    const match = itemsByCode.get(code) || null;
    itemsByCode.delete(code);
    rows.push({
      item: match,
      code,
      description: BEITHADY_BUILDINGS[code].description,
    });
  }
  for (const [code, item] of itemsByCode) {
    rows.push({ item, code });
  }
  return (
    <div className="ix-card overflow-hidden mt-3">
      <table className="w-full text-sm">
        <thead className="bg-indigo-50/60 text-indigo-900">
          <tr>
            <th className="text-left py-2.5 px-6 font-medium">Building</th>
            <th className="text-right px-6 font-medium">Reservations</th>
            <th className="text-right px-6 font-medium">Share</th>
            <th className="text-right px-6 font-medium">Nights</th>
            <th className="text-right px-6 font-medium">Avg nights / res</th>
            <th className="text-right px-6 font-medium">Total payout (USD)</th>
            <th className="text-right px-6 font-medium">Avg payout / res</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const b = row.item;
            const count = b?.reservation_count || 0;
            const nights = b?.nights || 0;
            const payout = b?.total_payout || 0;
            const pct = totalRes ? (count / totalRes) * 100 : 0;
            const avgNights = count ? nights / count : 0;
            const avgPayout = count ? payout / count : 0;
            const empty = count === 0;
            return (
              <tr
                key={row.code}
                className={`border-t border-slate-100 ${empty ? 'text-slate-400' : 'hover:bg-indigo-50/30'}`}
              >
                <td className="py-2.5 px-6">
                  <div className="font-mono font-semibold text-indigo-700">
                    {row.code}
                  </div>
                  {row.description && (
                    <div className="text-[11px] text-slate-500 font-normal">
                      {row.description}
                    </div>
                  )}
                </td>
                <td className="px-6 text-right tabular-nums font-semibold">
                  {count || '—'}
                </td>
                <td className="px-6 text-right tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden inline-block">
                      <span
                        className="block h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    {empty ? '—' : `${pct.toFixed(1)}%`}
                  </span>
                </td>
                <td className="px-6 text-right tabular-nums">{nights || '—'}</td>
                <td className="px-6 text-right tabular-nums">
                  {empty ? '—' : avgNights.toFixed(1)}
                </td>
                <td className="px-6 text-right tabular-nums font-medium">
                  {empty ? '—' : fmt(payout)}
                </td>
                <td className="px-6 text-right tabular-nums text-slate-600">
                  {empty ? '—' : fmt(avgPayout)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type DistBucket = {
  key: string;
  label: string;
  count: number;
  nights: number;
  payout: number;
};

function bucketStayLengths(bookings: any[]): DistBucket[] {
  const defs: Array<{
    key: string;
    label: string;
    match: (n: number) => boolean;
  }> = [
    { key: 'short', label: 'Short ≤2 nights', match: n => n <= 2 },
    { key: 'mid', label: 'Mid 3–7 nights', match: n => n >= 3 && n <= 7 },
    { key: 'long', label: 'Long 8–14 nights', match: n => n >= 8 && n <= 14 },
    { key: 'ext', label: 'Extended 15+ nights', match: n => n >= 15 },
  ];
  const out: DistBucket[] = defs.map(d => ({
    key: d.key,
    label: d.label,
    count: 0,
    nights: 0,
    payout: 0,
  }));
  for (const b of bookings) {
    const n = Number(b.nights) || 0;
    const idx = defs.findIndex(d => d.match(n));
    if (idx >= 0) {
      out[idx].count += 1;
      out[idx].nights += n;
      out[idx].payout += Number(b.total_payout) || 0;
    }
  }
  return out;
}

function bucketLeadTimes(
  bookings: any[],
  rangeFromIso?: string
): DistBucket[] {
  const defs: Array<{
    key: string;
    label: string;
    match: (d: number) => boolean;
  }> = [
    { key: 'lm', label: 'Last-minute <1 d', match: d => d < 1 },
    { key: 's', label: 'Short 1–7 d', match: d => d >= 1 && d <= 7 },
    { key: 'm', label: 'Medium 8–30 d', match: d => d >= 8 && d <= 30 },
    { key: 'f', label: 'Far 31–90 d', match: d => d >= 31 && d <= 90 },
    { key: 'd', label: 'Distant 90+ d', match: d => d > 90 },
  ];
  const out: DistBucket[] = defs.map(d => ({
    key: d.key,
    label: d.label,
    count: 0,
    nights: 0,
    payout: 0,
  }));
  const anchor = rangeFromIso ? Date.parse(rangeFromIso) : NaN;
  if (!Number.isFinite(anchor)) {
    return out.map(o => ({ ...o, label: o.label + ' (needs run)' }));
  }
  for (const b of bookings) {
    const ci = Date.parse((b.check_in_date || '') + 'T00:00:00Z');
    if (!Number.isFinite(ci)) continue;
    const d = Math.round((ci - anchor) / (24 * 3600 * 1000));
    const idx = defs.findIndex(def => def.match(d));
    if (idx >= 0) {
      out[idx].count += 1;
      out[idx].nights += Number(b.nights) || 0;
      out[idx].payout += Number(b.total_payout) || 0;
    }
  }
  return out;
}

function groupByCheckInMonth(bookings: any[]): DistBucket[] {
  const map = new Map<string, DistBucket>();
  for (const b of bookings) {
    const ci = String(b.check_in_date || '');
    if (!/^\d{4}-\d{2}/.test(ci)) continue;
    const key = ci.slice(0, 7);
    const label = new Date(key + '-01T00:00:00Z').toLocaleString(undefined, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.nights += Number(b.nights) || 0;
      existing.payout += Number(b.total_payout) || 0;
    } else {
      map.set(key, {
        key,
        label,
        count: 1,
        nights: Number(b.nights) || 0,
        payout: Number(b.total_payout) || 0,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function groupByCheckInWeekday(bookings: any[]): DistBucket[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const out: DistBucket[] = days.map((d, i) => ({
    key: String(i),
    label: d,
    count: 0,
    nights: 0,
    payout: 0,
  }));
  for (const b of bookings) {
    const ci = Date.parse((b.check_in_date || '') + 'T00:00:00Z');
    if (!Number.isFinite(ci)) continue;
    const wd = new Date(ci).getUTCDay();
    out[wd].count += 1;
    out[wd].nights += Number(b.nights) || 0;
    out[wd].payout += Number(b.total_payout) || 0;
  }
  return out;
}

function BucketPanel({
  title,
  hint,
  items,
  Icon,
  palette,
}: {
  title: string;
  hint?: string;
  items: DistBucket[];
  Icon: any;
  palette: 'violet' | 'indigo' | 'rose' | 'emerald';
}) {
  const bars: Record<typeof palette, string> = {
    violet: 'from-violet-500 to-fuchsia-500',
    indigo: 'from-indigo-500 to-blue-500',
    rose: 'from-rose-500 to-pink-500',
    emerald: 'from-emerald-500 to-teal-500',
  };
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <div className="ix-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-slate-500" />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {hint && <p className="text-xs text-slate-500 mb-3">{hint}</p>}
      <div className="space-y-3">
        {items.map(i => {
          const pct = Math.round((i.count / max) * 100);
          return (
            <div key={i.key}>
              <div className="flex items-center justify-between text-sm mb-1 gap-3">
                <div className="font-medium text-slate-700">{i.label}</div>
                <div className="text-slate-500 tabular-nums text-right text-xs shrink-0">
                  <span className="font-semibold text-slate-900">{i.count}</span> res
                  {i.nights ? ` · ${i.nights}n` : ''}
                  {i.payout ? ` · ${fmt(i.payout)} USD` : ''}
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${bars[palette]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckInMonthPanel({ items }: { items: DistBucket[] }) {
  if (!items.length) {
    return (
      <div className="ix-card p-6 text-center text-sm text-slate-500">
        No check-ins in this period.
      </div>
    );
  }
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <div className="ix-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays size={16} className="text-rose-500" />
        <h3 className="text-base font-semibold">Check-ins by month</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Operational heat — when reservations actually land on the ground.
      </p>
      <div className="flex items-end gap-2 h-40">
        {items.map(i => {
          const h = Math.round((i.count / max) * 100);
          return (
            <div
              key={i.key}
              className="flex-1 flex flex-col items-center justify-end gap-1 group"
              title={`${i.label}: ${i.count} reservations · ${i.nights}n · ${fmt(i.payout)} USD`}
            >
              <div className="text-[10px] font-semibold text-slate-700">
                {i.count}
              </div>
              <div
                className="w-full rounded-md bg-gradient-to-t from-rose-500 to-pink-400 group-hover:from-rose-600 transition"
                style={{ height: `${Math.max(4, h)}%` }}
              />
              <div className="text-[10px] text-slate-500 whitespace-nowrap">
                {i.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckInWeekdayPanel({ items }: { items: DistBucket[] }) {
  const max = Math.max(1, ...items.map(i => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="ix-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={16} className="text-indigo-500" />
        <h3 className="text-base font-semibold">Check-in day-of-week mix</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Which weekdays guests arrive on — drives cleaning and front-desk staffing.
      </p>
      <div className="grid grid-cols-7 gap-2">
        {items.map(i => {
          const pct = total ? (i.count / total) * 100 : 0;
          const h = Math.round((i.count / max) * 100);
          return (
            <div key={i.key} className="flex flex-col items-center">
              <div className="h-24 w-full flex items-end justify-center">
                <div
                  className="w-full rounded-md bg-gradient-to-t from-indigo-500 to-violet-400"
                  style={{ height: `${Math.max(4, h)}%` }}
                />
              </div>
              <div className="text-[10px] font-semibold text-slate-700 mt-1">
                {i.label}
              </div>
              <div className="text-[10px] text-slate-500 tabular-nums">
                {i.count} · {pct.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BucketBars({
  items,
  palette,
}: {
  items: BucketStat[];
  palette: 'rose' | 'emerald' | 'indigo' | 'violet';
}) {
  if (!items.length) {
    return (
      <div className="ix-card p-6 text-center text-sm text-slate-500">
        No data.
      </div>
    );
  }
  const bars: Record<typeof palette, string> = {
    rose: 'from-rose-500 to-pink-500',
    emerald: 'from-emerald-500 to-teal-500',
    indigo: 'from-indigo-500 to-violet-500',
    violet: 'from-violet-500 to-fuchsia-500',
  };
  const max = Math.max(1, ...items.map(i => i.reservation_count));
  return (
    <div className="ix-card p-6 space-y-3">
      {items.map(b => {
        const pct = Math.round((b.reservation_count / max) * 100);
        return (
          <div key={b.key}>
            <div className="flex items-center justify-between text-sm mb-1 gap-3">
              <div className="font-mono text-xs truncate" title={b.label}>
                {b.label}
              </div>
              <div className="text-slate-500 tabular-nums text-right shrink-0 text-xs">
                <span className="font-semibold text-slate-900">
                  {b.reservation_count}
                </span>{' '}
                res · {b.nights}n · {fmt(b.total_payout)} USD
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${bars[palette]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GuestTable({ bookings }: { bookings: any[] }) {
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
          <th className="text-right px-6 font-medium">Payout (USD)</th>
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
              {fmt(g.payout)}
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

function ReconciliationPanel({ out }: { out: any }) {
  const airbnbChecked: number = out?.airbnb_emails_checked ?? 0;
  const airbnbParsed: number = out?.airbnb_confirmations_parsed ?? 0;
  const airbnbParseErrors: number = out?.airbnb_parse_errors ?? 0;
  const matchedInGuesty: number = out?.airbnb_matched_in_guesty ?? 0;
  const guestyNotInAirbnb: number = out?.guesty_not_in_airbnb ?? 0;
  const missingFromGuesty: Array<{
    confirmation_code: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    listing_name: string | null;
    nights: number | null;
    host_payout: number | null;
  }> = out?.missing_from_guesty || [];
  const markedRead: number = out?.marked_read_airbnb ?? 0;
  const markErrors: number = out?.mark_errors_airbnb ?? 0;

  const missingCount = missingFromGuesty.length;
  const hasRunReconciliation = airbnbChecked > 0 || airbnbParsed > 0;

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Airbnb confirmations"
          value={airbnbParsed.toLocaleString()}
          hint={`${airbnbChecked.toLocaleString()} email${airbnbChecked !== 1 ? 's' : ''} scanned${airbnbParseErrors > 0 ? ` · ${airbnbParseErrors} parse errors` : ''}`}
          Icon={Plane}
          accent="rose"
        />
        <Stat
          label="Matched in Guesty"
          value={matchedInGuesty.toLocaleString()}
          hint="Airbnb code found in a Guesty NEW BOOKING email"
          Icon={CheckCircle2}
          accent="emerald"
        />
        <Stat
          label="Missing from Guesty"
          value={missingCount.toLocaleString()}
          hint="Airbnb confirmed but no matching Guesty email"
          Icon={AlertTriangle}
          accent={missingCount > 0 ? 'amber' : 'emerald'}
        />
        <Stat
          label="Guesty (Airbnb) not matched"
          value={guestyNotInAirbnb.toLocaleString()}
          hint="Guesty Airbnb bookings with no direct Airbnb confirmation"
          Icon={GitCompare}
          accent={guestyNotInAirbnb > 0 ? 'indigo' : 'emerald'}
        />
      </div>

      {hasRunReconciliation && (markedRead > 0 || markErrors > 0) && (
        <div
          className={`ix-card p-3 text-xs ${
            markErrors > 0 && markedRead === 0
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {markedRead > 0 && (
            <>
              <CheckCircle2 size={14} className="inline mr-1" />
              Marked {markedRead} Airbnb confirmation email
              {markedRead !== 1 ? 's' : ''} as read.
            </>
          )}
          {markErrors > 0 && (
            <span className="ml-2">
              ({markErrors} Airbnb mark error{markErrors !== 1 ? 's' : ''} — usually
              means kareem@limeinc.cc needs re-auth for gmail.modify.)
            </span>
          )}
        </div>
      )}

      {missingCount > 0 ? (
        <div className="ix-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-amber-50/60">
            <h3 className="text-base font-semibold flex items-center gap-2 text-amber-900">
              <AlertTriangle size={16} />
              {missingCount} Airbnb reservation{missingCount !== 1 ? 's' : ''} missing from Guesty
            </h3>
            <p className="text-xs text-amber-800 mt-0.5">
              Airbnb sent a confirmation email but no matching Guesty NEW BOOKING was
              received. Investigate in Guesty: open the reservation by code and confirm
              it was imported; if not, trigger a manual sync.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Code</th>
                  <th className="text-left px-4 font-medium">Guest</th>
                  <th className="text-left px-4 font-medium">Listing</th>
                  <th className="text-left px-4 font-medium">Check-in</th>
                  <th className="text-left px-4 font-medium">Check-out</th>
                  <th className="text-right px-4 font-medium">Nights</th>
                  <th className="text-right px-4 font-medium">Payout (USD)</th>
                </tr>
              </thead>
              <tbody>
                {missingFromGuesty.map((m, i) => (
                  <tr
                    key={`${m.confirmation_code}-${i}`}
                    className="border-t border-slate-100 hover:bg-amber-50/30"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-rose-700 font-semibold">
                      {m.confirmation_code}
                    </td>
                    <td className="px-4">{m.guest_name}</td>
                    <td
                      className="px-4 max-w-[260px] truncate"
                      title={m.listing_name || undefined}
                    >
                      {m.listing_name || '—'}
                    </td>
                    <td className="px-4 whitespace-nowrap">{m.check_in_date}</td>
                    <td className="px-4 whitespace-nowrap">{m.check_out_date}</td>
                    <td className="px-4 text-right tabular-nums">
                      {m.nights ?? '—'}
                    </td>
                    <td className="px-4 text-right tabular-nums font-medium">
                      {m.host_payout != null ? fmt(m.host_payout) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : hasRunReconciliation ? (
        <div className="ix-card p-4 border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          All {matchedInGuesty} Airbnb confirmation
          {matchedInGuesty !== 1 ? 's' : ''} have a matching Guesty booking. Nothing
          missing.
        </div>
      ) : (
        <div className="ix-card p-4 bg-slate-50 text-slate-600 text-xs">
          No Airbnb reservation-confirmation emails were found in this range. The
          reconciliation looks for messages <span className="font-mono">to:guesty@beithady.com subject:&quot;Reservation confirmed&quot;</span> (Airbnb confirmations relayed via Guesty).
        </div>
      )}
    </div>
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

function StarRow({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={13}
          className={
            i <= rounded ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
          }
        />
      ))}
    </span>
  );
}

function BeithadyReviewView({
  out,
  emailsMatched,
}: {
  out: any;
  emailsMatched: number;
}) {
  const total: number = out?.total_reviews ?? 0;
  const avg: number = Number(out?.avg_rating ?? 0);
  const lowCount: number = out?.low_rating_count ?? 0;
  const fiveStar: number = out?.five_star_count ?? 0;
  const histogram: Record<string, number> = out?.rating_histogram || {};
  const byBuilding: Array<{
    key: string;
    review_count: number;
    avg_rating: number;
    low_rating_count: number;
    five_star_count: number;
  }> = out?.by_building || [];
  const byMonth: Array<{
    month: string;
    label: string;
    count: number;
    avg_rating: number;
  }> = out?.by_month || [];
  const topBuilding: {
    key: string;
    review_count: number;
    avg_rating: number;
  } | null = out?.top_building || null;
  const worstBuilding: {
    key: string;
    review_count: number;
    avg_rating: number;
  } | null = out?.worst_building || null;
  const flagged: Array<{
    guest_name: string;
    rating: number;
    review_text: string | null;
    listing_name: string | null;
    stay_start: string | null;
    stay_end: string | null;
    email_date: string | null;
    building_code: string | null;
    action_plan: {
      category: string;
      priority: 'high' | 'medium' | 'low';
      root_cause: string;
      suggested_response: string;
      internal_action: string;
    } | null;
  }> = out?.flagged_reviews || [];
  const reviews: Array<{
    guest_name: string;
    rating: number;
    review_text: string | null;
    listing_name: string | null;
    stay_start: string | null;
    stay_end: string | null;
    email_date: string | null;
    building_code: string | null;
  }> = out?.reviews || [];

  const maxHist = Math.max(1, ...Object.values(histogram).map(v => Number(v) || 0));
  const lowShare = total > 0 ? (lowCount / total) * 100 : 0;

  return (
    <>
      <section
        className="relative rounded-2xl overflow-hidden border border-amber-200/60 shadow-sm"
        style={{
          background:
            'linear-gradient(135deg, rgba(251,191,36,0.10) 0%, rgba(249,115,22,0.06) 45%, rgba(244,63,94,0.08) 100%)',
        }}
      >
        <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 opacity-20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 opacity-15 blur-3xl pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-amber-700 text-xs uppercase tracking-wider font-semibold">
            <Star size={14} /> Beithady · Guest reviews
          </div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
            <HeroStat
              label="Total reviews"
              value={total.toLocaleString()}
              sub={`${emailsMatched.toLocaleString()} review emails processed`}
              Icon={Star}
            />
            <HeroStat
              label="Average rating"
              value={avg ? `${avg.toFixed(2)}⭐` : '—'}
              sub={
                total > 0
                  ? `Across ${total} review${total !== 1 ? 's' : ''}`
                  : 'No reviews yet in range'
              }
              Icon={TrendingUp}
            />
            <HeroStat
              label="Flagged (<3⭐)"
              value={lowCount.toLocaleString()}
              sub={
                total > 0
                  ? `${lowShare.toFixed(1)}% of reviews need follow-up`
                  : 'Nothing flagged'
              }
              Icon={Flag}
            />
            <HeroStat
              label="5-star reviews"
              value={fiveStar.toLocaleString()}
              sub={
                total > 0
                  ? `${((fiveStar / total) * 100).toFixed(1)}% of reviews`
                  : '—'
              }
              Icon={ThumbsUp}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Rating distribution"
          hint="How reviews split across the 1-5 scale. Anything below 3 is flagged for follow-up."
        />
        <div className="ix-card p-6 mt-3 space-y-3">
          {(['5', '4', '3', '2', '1'] as const).map(r => {
            const count = Number(histogram[r] || 0);
            const pct = total > 0 ? (count / total) * 100 : 0;
            const barPct = (count / maxHist) * 100;
            const isLow = r === '1' || r === '2';
            const isFive = r === '5';
            return (
              <div key={r} className="flex items-center gap-3">
                <div className="w-20 flex items-center gap-1 text-sm">
                  <span className="font-semibold tabular-nums">{r}</span>
                  <Star size={13} className="fill-amber-400 text-amber-400" />
                </div>
                <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isFive
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : isLow
                          ? 'bg-gradient-to-r from-rose-500 to-red-500'
                          : 'bg-gradient-to-r from-amber-400 to-orange-400'
                    }`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <div className="w-24 text-right text-xs text-slate-600 tabular-nums">
                  {count} · {pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(topBuilding || worstBuilding) && (
        <section>
          <SectionHeader
            title="Best / worst performer"
            hint="Requires at least 2 reviews per building to qualify. Building inferred from listing name (EDNC/New Cairo/Kattameya → BH-OK; Heliopolis/Merghany → BH-MG; otherwise UNKNOWN)."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div className="ix-card p-5 border-emerald-200 bg-emerald-50/40">
              <div className="flex items-center gap-2 text-emerald-700 text-xs uppercase tracking-wider font-semibold">
                <ThumbsUp size={14} /> Best average
              </div>
              {topBuilding ? (
                <>
                  <div className="mt-2 font-mono font-bold text-xl">
                    {topBuilding.key}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <StarRow rating={topBuilding.avg_rating} />
                    <span className="font-semibold tabular-nums">
                      {topBuilding.avg_rating.toFixed(2)}
                    </span>
                    <span className="text-slate-500 text-xs">
                      · {topBuilding.review_count} reviews
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-slate-500">
                  Not enough data (need ≥2 reviews per building).
                </div>
              )}
            </div>
            <div className="ix-card p-5 border-rose-200 bg-rose-50/40">
              <div className="flex items-center gap-2 text-rose-700 text-xs uppercase tracking-wider font-semibold">
                <ThumbsDown size={14} /> Worst average
              </div>
              {worstBuilding ? (
                <>
                  <div className="mt-2 font-mono font-bold text-xl">
                    {worstBuilding.key}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <StarRow rating={worstBuilding.avg_rating} />
                    <span className="font-semibold tabular-nums">
                      {worstBuilding.avg_rating.toFixed(2)}
                    </span>
                    <span className="text-slate-500 text-xs">
                      · {worstBuilding.review_count} reviews
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-slate-500">
                  Not enough data (need ≥2 reviews per building).
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {byBuilding.length > 0 && (
        <section>
          <SectionHeader
            title="By building"
            hint="Reviews grouped by inferred building. UNKNOWN rows couldn't be attributed from the listing name alone."
          />
          <div className="ix-card overflow-hidden mt-3">
            <table className="w-full text-sm">
              <thead className="bg-amber-50/60 text-amber-900">
                <tr>
                  <th className="text-left py-2.5 px-6 font-medium">Building</th>
                  <th className="text-right px-6 font-medium">Reviews</th>
                  <th className="text-left px-6 font-medium">Avg</th>
                  <th className="text-right px-6 font-medium">Flagged (&lt;3)</th>
                  <th className="text-right px-6 font-medium">5-star</th>
                </tr>
              </thead>
              <tbody>
                {byBuilding.map(b => (
                  <tr key={b.key} className="border-t border-slate-100">
                    <td className="py-2.5 px-6 font-mono font-semibold">{b.key}</td>
                    <td className="px-6 text-right tabular-nums">
                      {b.review_count}
                    </td>
                    <td className="px-6">
                      <div className="flex items-center gap-2">
                        <StarRow rating={b.avg_rating} />
                        <span className="tabular-nums text-xs">
                          {b.avg_rating.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`px-6 text-right tabular-nums ${
                        b.low_rating_count > 0 ? 'text-rose-700 font-semibold' : ''
                      }`}
                    >
                      {b.low_rating_count}
                    </td>
                    <td className="px-6 text-right tabular-nums">
                      {b.five_star_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {byMonth.length > 0 && (
        <section>
          <SectionHeader
            title="Trend by month"
            hint="Average rating and review volume per month (grouped by email received date)."
          />
          <div className="ix-card overflow-hidden mt-3">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left py-2.5 px-6 font-medium">Month</th>
                  <th className="text-right px-6 font-medium">Reviews</th>
                  <th className="text-left px-6 font-medium">Avg</th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map(m => (
                  <tr key={m.month} className="border-t border-slate-100">
                    <td className="py-2.5 px-6">{m.label}</td>
                    <td className="px-6 text-right tabular-nums">{m.count}</td>
                    <td className="px-6">
                      <div className="flex items-center gap-2">
                        <StarRow rating={m.avg_rating} />
                        <span className="tabular-nums text-xs">
                          {m.avg_rating.toFixed(2)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {flagged.length > 0 && (
        <section>
          <SectionHeader
            title={`Flagged reviews (${flagged.length})`}
            hint="Ratings below 3⭐. Each has a suggested public reply and an internal action. Email notifications usually don't include the guest's written text (it's still editable for 48h), so the action plan reasons from the rating + listing."
          />
          <div className="space-y-4 mt-3">
            {flagged.map((f, i) => (
              <div
                key={i}
                className="ix-card overflow-hidden border-rose-200/80"
              >
                <div className="px-6 py-4 bg-rose-50/60 border-b border-rose-100 flex items-start justify-between flex-wrap gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MessageSquareWarning
                        size={16}
                        className="text-rose-700 shrink-0"
                      />
                      <span className="font-semibold">{f.guest_name}</span>
                      <StarRow rating={f.rating} />
                      <span className="text-xs text-rose-700 font-semibold tabular-nums">
                        {f.rating}/5
                      </span>
                      {f.building_code && (
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                          {f.building_code}
                        </span>
                      )}
                      {f.action_plan?.priority && (
                        <span
                          className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                            f.action_plan.priority === 'high'
                              ? 'bg-rose-600 text-white'
                              : f.action_plan.priority === 'medium'
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {f.action_plan.priority} priority
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-1 text-xs text-slate-600 truncate"
                      title={f.listing_name || undefined}
                    >
                      {f.listing_name || 'Unknown listing'}
                      {f.stay_start && f.stay_end
                        ? ` · ${f.stay_start} → ${f.stay_end}`
                        : ''}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 whitespace-nowrap">
                    {f.email_date
                      ? new Date(f.email_date).toLocaleDateString()
                      : '—'}
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {f.review_text && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                        Guest review
                      </div>
                      <blockquote className="border-l-4 border-rose-300 pl-4 text-sm text-slate-700 italic">
                        {f.review_text}
                      </blockquote>
                    </div>
                  )}
                  {f.action_plan ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                            Category
                          </div>
                          <div className="inline-flex items-center gap-1.5 text-sm font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {f.action_plan.category}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                            Root cause
                          </div>
                          <div className="text-sm text-slate-700">
                            {f.action_plan.root_cause}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 mb-1 flex items-center gap-1">
                          <Lightbulb size={12} /> Suggested public reply
                        </div>
                        <div className="text-sm text-slate-800 bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
                          {f.action_plan.suggested_response}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-indigo-700 mb-1 flex items-center gap-1">
                          <Flag size={12} /> Internal action
                        </div>
                        <div className="text-sm text-slate-800 bg-indigo-50/60 border border-indigo-200 rounded-lg p-3">
                          {f.action_plan.internal_action}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500">
                      Action plan could not be generated for this review (Haiku
                      call failed). Re-run to retry.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section>
          <SectionHeader
            title={`All reviews (${reviews.length})`}
            hint="Every review in the selected range. Sortable by your email client's own filtering."
          />
          <div className="ix-card overflow-hidden mt-3">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Date</th>
                  <th className="text-left px-4 font-medium">Guest</th>
                  <th className="text-left px-4 font-medium">Rating</th>
                  <th className="text-left px-4 font-medium">Listing</th>
                  <th className="text-left px-4 font-medium">Bldg</th>
                  <th className="text-left px-4 font-medium">Stay</th>
                </tr>
              </thead>
              <tbody>
                {reviews.slice(0, 200).map((r, i) => (
                  <tr
                    key={`${r.guest_name}-${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap text-xs text-slate-600">
                      {r.email_date
                        ? new Date(r.email_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4">{r.guest_name}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-1.5">
                        <StarRow rating={r.rating} />
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            r.rating < 3
                              ? 'text-rose-700'
                              : r.rating === 5
                                ? 'text-emerald-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {r.rating}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-4 max-w-[260px] truncate text-xs"
                      title={r.listing_name || undefined}
                    >
                      {r.listing_name || '—'}
                    </td>
                    <td className="px-4 font-mono text-xs">
                      {r.building_code || '—'}
                    </td>
                    <td className="px-4 whitespace-nowrap text-xs text-slate-600">
                      {r.stay_start && r.stay_end
                        ? `${r.stay_start} → ${r.stay_end}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {total === 0 && (
        <section>
          <div className="ix-card p-6 bg-slate-50 text-slate-600 text-sm">
            No review emails in this range. The rule searches for messages{' '}
            <span className="font-mono">
              to:guesty@beithady.com subject:&quot;review&quot;
            </span>
            . Airbnb notifies once a guest posts a review (subject like
            &quot;Charlie left a 5-star review!&quot;).
          </div>
        </section>
      )}
    </>
  );
}
