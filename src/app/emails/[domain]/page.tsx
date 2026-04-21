import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  Play,
  ArrowRight,
  ShoppingBag,
  ListChecks,
  Layers,
  BedDouble,
  Banknote,
  Star,
  MessageCircleQuestion,
} from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
import { DomainIcon } from '@/app/_components/domain-icon';
import { runRuleAction } from '@/app/admin/rules/actions';
import {
  DOMAINS,
  DOMAIN_LABELS,
  DOMAIN_DESCRIPTIONS,
  DOMAIN_ACCENTS,
  isDomain,
  type Domain,
  type DomainAccent,
} from '@/lib/rules/presets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACCENT_TINTS: Record<DomainAccent, string> = {
  slate: 'bg-slate-50 text-slate-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  rose: 'bg-rose-50 text-rose-600',
};

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  domain: string | null;
  conditions: any;
  actions: any;
  account: { email: string } | null;
  latest_run: {
    finished_at: string | null;
    status: string;
    output: any;
    input_email_count: number;
  } | null;
};

export default async function DomainRulesPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  if (domain !== 'other' && !isDomain(domain)) notFound();

  const isOther = domain === 'other';
  const d = isDomain(domain) ? (domain as Domain) : null;
  const label = isOther ? 'Other' : DOMAIN_LABELS[d!];
  const description = isOther
    ? 'Rules without a domain assigned.'
    : DOMAIN_DESCRIPTIONS[d!];
  const accent: DomainAccent = isOther ? 'slate' : DOMAIN_ACCENTS[d!];
  const tint = ACCENT_TINTS[accent];

  const sb = supabaseAdmin();

  let q = sb
    .from('rules')
    .select('id, name, enabled, domain, conditions, actions, account:accounts(email)')
    .order('priority', { ascending: true });
  if (isOther) q = q.is('domain', null);
  else q = q.eq('domain', d!);

  const { data: rules } = await q;

  const enriched: RuleRow[] = await Promise.all(
    (rules || []).map(async (r: any) => {
      const { data: latest } = await sb
        .from('rule_runs')
        .select('finished_at, status, output, input_email_count')
        .eq('rule_id', r.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...r, latest_run: latest };
    })
  );

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>{label}</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl inline-flex items-center justify-center ${tint}`}>
              {isOther ? (
                <Layers size={28} strokeWidth={2.2} />
              ) : (
                <DomainIcon domain={d!} size={28} />
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                Reports &amp; outputs · {label}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">{label}</h1>
              <p className="text-sm text-slate-500 mt-1">{description}</p>
            </div>
          </div>
          <Link href="/admin/rules/new" className="ix-btn-secondary">
            <ListChecks size={16} /> New rule
          </Link>
        </header>

        {!enriched.length ? (
          <div className="ix-card p-10 text-center">
            <p className="text-slate-500 text-sm mb-4">
              No rules under {label} yet.
            </p>
            <Link href="/admin/rules/new" className="ix-btn-primary">
              Create rule
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {enriched.map(r => {
              const out = r.latest_run?.output;
              const actionType = (r.actions as any)?.type || 'shopify_order_aggregate';
              const isBeithadyBooking = actionType === 'beithady_booking_aggregate';
              const isBeithadyPayout = actionType === 'beithady_payout_aggregate';
              const isBeithadyReviews = actionType === 'beithady_reviews_aggregate';
              const isBeithadyInquiries = actionType === 'beithady_inquiries_aggregate';
              const currency = out?.currency || (isBeithadyBooking ? 'USD' : 'EGP');

              const Icon = isBeithadyInquiries
                ? MessageCircleQuestion
                : isBeithadyReviews
                  ? Star
                  : isBeithadyPayout
                    ? Banknote
                    : isBeithadyBooking
                      ? BedDouble
                      : ShoppingBag;
              const iconTint = isBeithadyInquiries
                ? 'bg-sky-50 text-sky-600'
                : isBeithadyReviews
                  ? 'bg-amber-50 text-amber-600'
                  : isBeithadyPayout
                    ? 'bg-emerald-50 text-emerald-600'
                    : isBeithadyBooking
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-violet-50 text-violet-600';

              return (
                <div
                  key={r.id}
                  className="group ix-card p-5 hover:shadow-md transition relative overflow-hidden"
                >
                  <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 opacity-[0.06] blur-2xl pointer-events-none" />
                  <Link
                    href={`/emails/${domain}/${r.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${iconTint}`}>
                          <Icon size={16} />
                        </div>
                        <h3 className="font-semibold truncate">{r.name}</h3>
                        {!r.enabled && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
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
                      className="text-slate-400 group-hover:text-indigo-600 transition shrink-0"
                    />
                  </Link>

                  {isBeithadyInquiries ? (
                    <BeithadyInquiryMini out={out} />
                  ) : isBeithadyReviews ? (
                    <BeithadyReviewMini out={out} />
                  ) : isBeithadyPayout ? (
                    <BeithadyPayoutMini out={out} />
                  ) : isBeithadyBooking ? (
                    <BeithadyMini out={out} currency="USD" />
                  ) : (
                    <ShopifyMini out={out} currency={currency} />
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {r.latest_run?.finished_at
                        ? `Last run · ${new Date(r.latest_run.finished_at).toLocaleString()}`
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
            })}
          </div>
        )}
      </main>
    </>
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

function ShopifyMini({ out, currency }: { out: any; currency: string }) {
  const orders = out?.order_count ?? 0;
  const total = out?.total_amount ?? 0;
  const productsArr = (out?.products as any[]) || [];
  const subtotal =
    out?.line_items_subtotal ??
    productsArr.reduce((s: number, p: any) => s + (p.total_revenue || 0), 0);
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Orders" value={String(orders)} />
      <MiniStat label={`Total paid ${currency}`} value={total.toLocaleString()} />
      <MiniStat
        label={`Product revenue ${currency}`}
        value={subtotal.toLocaleString()}
      />
      <MiniStat label="Products" value={String(productsArr.length)} />
    </div>
  );
}

function BeithadyMini({ out }: { out: any; currency: string }) {
  const reservations = out?.reservation_count ?? 0;
  const totalPayout = Math.round(Number(out?.total_payout) || 0);
  const totalNights = out?.total_nights ?? 0;
  const uniqueBuildings = out?.unique_buildings ?? ((out?.by_building as any[]) || []).length;
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Reservations" value={String(reservations)} />
      <MiniStat label="Total payout USD" value={totalPayout.toLocaleString()} />
      <MiniStat label="Nights" value={String(totalNights)} />
      <MiniStat label="Buildings" value={String(uniqueBuildings)} />
    </div>
  );
}

function BeithadyPayoutMini({ out }: { out: any }) {
  const totalAed = Math.round(Number(out?.total_aed) || 0);
  const airbnbAed = Math.round(Number(out?.airbnb_total_aed) || 0);
  const stripeAed = Math.round(Number(out?.stripe_total_aed) || 0);
  const emails =
    (out?.airbnb_email_count ?? 0) + (out?.stripe_email_count ?? 0);
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Total AED" value={totalAed.toLocaleString()} />
      <MiniStat label="Airbnb AED" value={airbnbAed.toLocaleString()} />
      <MiniStat label="Stripe AED" value={stripeAed.toLocaleString()} />
      <MiniStat label="Payout emails" value={String(emails)} />
    </div>
  );
}

function BeithadyReviewMini({ out }: { out: any }) {
  const total = out?.total_reviews ?? 0;
  const avg = Number(out?.avg_rating ?? 0);
  const low = out?.low_rating_count ?? 0;
  const five = out?.five_star_count ?? 0;
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Reviews" value={String(total)} />
      <MiniStat label="Avg rating" value={avg ? avg.toFixed(2) + '⭐' : '—'} />
      <MiniStat label="Flagged <3" value={String(low)} />
      <MiniStat label="5-star" value={String(five)} />
    </div>
  );
}

function BeithadyInquiryMini({ out }: { out: any }) {
  const total = out?.total_inquiries ?? 0;
  const guests = out?.unique_guests ?? 0;
  const manual = out?.manual_attention_count ?? 0;
  const emails = out?.email_count ?? 0;
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">
      <MiniStat label="Inquiries" value={String(total)} />
      <MiniStat label="Unique guests" value={String(guests)} />
      <MiniStat label="Needs attention" value={String(manual)} />
      <MiniStat label="Emails" value={String(emails)} />
    </div>
  );
}
