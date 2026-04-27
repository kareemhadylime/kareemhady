import Link from 'next/link';
import { ArrowRight, Play, BedDouble, Banknote, Star, MessageCircleQuestion, LifeBuoy, ShoppingBag } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { runRuleAction } from '@/app/admin/rules/actions';

// Compact mini-card grid that renders Beithady rule outputs filtered to a
// specific set of action types. Lifted from src/app/emails/[domain]/page.tsx
// so the new Beithady Financial + Analytics pages can each show only the
// relevant rules without duplicating the renderer.

export type AggregateType =
  | 'beithady_payout_aggregate'
  | 'beithady_booking_aggregate'
  | 'beithady_reviews_aggregate'
  | 'beithady_inquiries_aggregate'
  | 'beithady_requests_aggregate';

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  domain: string | null;
  conditions: unknown;
  actions: unknown;
  account: { email: string } | null;
  latest_run: {
    finished_at: string | null;
    status: string;
    output: Record<string, unknown> | null;
    input_email_count: number;
  } | null;
};

export async function BeithadyRuleCards({
  actionTypes,
  emptyMessage,
}: {
  actionTypes: AggregateType[];
  emptyMessage: string;
}) {
  const sb = supabaseAdmin();
  const { data: rules } = await sb
    .from('rules')
    .select('id, name, enabled, domain, conditions, actions, account:accounts(email)')
    .eq('domain', 'beithady')
    .order('priority', { ascending: true });

  const enriched: RuleRow[] = await Promise.all(
    (rules || []).map(async (r: Record<string, unknown>) => {
      const { data: latest } = await sb
        .from('rule_runs')
        .select('finished_at, status, output, input_email_count')
        .eq('rule_id', r.id as string)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...(r as unknown as RuleRow), latest_run: latest as RuleRow['latest_run'] };
    })
  );

  const set = new Set<string>(actionTypes);
  const filtered = enriched.filter(r => {
    const a = (r.actions as { type?: string } | null)?.type || '';
    return set.has(a);
  });

  if (!filtered.length) {
    return (
      <div className="ix-card p-6 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {filtered.map(r => (
        <RuleCard key={r.id} r={r} />
      ))}
    </div>
  );
}

function RuleCard({ r }: { r: RuleRow }) {
  const out = r.latest_run?.output as Record<string, unknown> | undefined;
  const actionType = (r.actions as { type?: string } | null)?.type || '';
  const isPayout = actionType === 'beithady_payout_aggregate';
  const isReviews = actionType === 'beithady_reviews_aggregate';
  const isInquiries = actionType === 'beithady_inquiries_aggregate';
  const isRequests = actionType === 'beithady_requests_aggregate';
  const isBooking = actionType === 'beithady_booking_aggregate';

  const Icon = isRequests
    ? LifeBuoy
    : isInquiries
      ? MessageCircleQuestion
      : isReviews
        ? Star
        : isPayout
          ? Banknote
          : isBooking
            ? BedDouble
            : ShoppingBag;
  const iconTint = isRequests
    ? 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300'
    : isInquiries
      ? 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300'
      : isReviews
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300'
        : isPayout
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
          : isBooking
            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'
            : 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300';

  return (
    <div className="group ix-card p-5 hover:shadow-md transition relative overflow-hidden">
      <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 opacity-[0.06] blur-2xl pointer-events-none" />
      <Link
        href={`/emails/beithady/${r.id}`}
        className="flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${iconTint}`}>
              <Icon size={16} />
            </div>
            <h3 className="font-semibold truncate">{r.name}</h3>
            {!r.enabled && (
              <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                disabled
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {r.account?.email || 'all accounts'}
          </div>
        </div>
        <ArrowRight
          size={18}
          className="text-slate-400 group-hover:text-slate-700 transition shrink-0"
        />
      </Link>

      {isPayout && <PayoutMini out={out} />}
      {isBooking && <BookingMini out={out} />}
      {isReviews && <ReviewMini out={out} />}
      {isInquiries && <InquiryMini out={out} />}
      {isRequests && <RequestMini out={out} />}

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>
          {r.latest_run?.finished_at
            ? `Last run · ${fmtCairoDateTime(r.latest_run.finished_at)}`
            : 'Not run yet'}
          {r.latest_run?.status === 'failed' && ' · failed'}
        </span>
        <form action={runRuleAction}>
          <input type="hidden" name="id" value={r.id} />
          <button type="submit" className="ix-btn-primary">
            <Play size={12} /> Run
          </button>
        </form>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function n(v: unknown): number {
  return Number(v) || 0;
}

function BookingMini({ out }: { out: Record<string, unknown> | undefined }) {
  if (!out) return null;
  const reservations = n(out.reservation_count);
  const totalPayout = Math.round(n(out.total_payout));
  const totalNights = n(out.total_nights);
  const uniqueBuildings = n(out.unique_buildings) || (Array.isArray(out.by_building) ? (out.by_building as unknown[]).length : 0);
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Reservations" value={String(reservations)} />
      <MiniStat label="Total payout USD" value={totalPayout.toLocaleString()} />
      <MiniStat label="Nights" value={String(totalNights)} />
      <MiniStat label="Buildings" value={String(uniqueBuildings)} />
    </div>
  );
}

function PayoutMini({ out }: { out: Record<string, unknown> | undefined }) {
  if (!out) return null;
  const AED_PER_USD = 3.6725;
  const toUsd = (aed: number) => Math.round(aed / AED_PER_USD);
  const totalUsd = toUsd(n(out.total_aed));
  const airbnbUsd =
    n(out.airbnb_total_usd) > 0
      ? Math.round(n(out.airbnb_total_usd))
      : toUsd(n(out.airbnb_total_aed));
  const stripeUsd = toUsd(n(out.stripe_total_aed));
  const emails = n(out.airbnb_email_count) + n(out.stripe_email_count);
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Total USD" value={totalUsd.toLocaleString()} />
      <MiniStat label="Airbnb USD" value={airbnbUsd.toLocaleString()} />
      <MiniStat label="Stripe USD" value={stripeUsd.toLocaleString()} />
      <MiniStat label="Payout emails" value={String(emails)} />
    </div>
  );
}

function ReviewMini({ out }: { out: Record<string, unknown> | undefined }) {
  if (!out) return null;
  const total = n(out.total_reviews);
  const avg = n(out.avg_rating);
  const low = n(out.low_rating_count);
  const five = n(out.five_star_count);
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Reviews" value={String(total)} />
      <MiniStat label="Avg rating" value={avg ? avg.toFixed(2) + '⭐' : '—'} />
      <MiniStat label="Flagged <3" value={String(low)} />
      <MiniStat label="5-star" value={String(five)} />
    </div>
  );
}

function InquiryMini({ out }: { out: Record<string, unknown> | undefined }) {
  if (!out) return null;
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Inquiries" value={String(n(out.total_inquiries))} />
      <MiniStat label="Unique guests" value={String(n(out.unique_guests))} />
      <MiniStat label="Needs attention" value={String(n(out.manual_attention_count))} />
      <MiniStat label="Emails" value={String(n(out.email_count))} />
    </div>
  );
}

function RequestMini({ out }: { out: Record<string, unknown> | undefined }) {
  if (!out) return null;
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Messages" value={String(n(out.total_messages))} />
      <MiniStat label="Reservations" value={String(n(out.unique_reservations))} />
      <MiniStat label="Immediate" value={String(n(out.immediate_count))} />
      <MiniStat label="Emails" value={String(n(out.email_count))} />
    </div>
  );
}
