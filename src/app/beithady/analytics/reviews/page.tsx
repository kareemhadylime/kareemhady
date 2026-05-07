import Link from 'next/link';
import { Star, Sparkles, Send, RefreshCw, Check, X, ChevronLeft, AlertTriangle, ExternalLink } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  listReviewsWithReplies,
  type ReviewBuildingFilter,
  type ReviewFilters,
  type ReviewStatusFilter,
} from '@/lib/beithady/pipeline/review-replies';
import { fmtCairoDate } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { generateReplyAction, sendReplyAction, dismissReplyAction, regenerateReplyAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHANNEL_BADGE: Record<string, string> = {
  airbnb2: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  airbnb: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  'booking.com': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  vrbo: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
};

const STATUS_OPTIONS: Array<{ value: ReviewStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'no_draft', label: 'Need draft' },
  { value: 'draft', label: 'Draft pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'dismissed', label: 'Dismissed' },
];

const BUILDING_OPTIONS: Array<{ value: ReviewBuildingFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'BH-26', label: 'BH-26' },
  { value: 'BH-73', label: 'BH-73' },
  { value: 'BH-435', label: 'BH-435' },
  { value: 'BH-OK', label: 'BH-OK' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_VALUES = new Set<ReviewStatusFilter>(STATUS_OPTIONS.map((o) => o.value));
const BUILDING_VALUES = new Set<ReviewBuildingFilter>(BUILDING_OPTIONS.map((o) => o.value));

function parseFilters(sp: { rating?: string; status?: string; building?: string }): ReviewFilters {
  const out: ReviewFilters = {};
  const ratingNum = sp.rating ? Number(sp.rating) : NaN;
  if ([1, 2, 3, 4, 5].includes(ratingNum)) {
    out.stars = ratingNum as 1 | 2 | 3 | 4 | 5;
  }
  if (sp.status && STATUS_VALUES.has(sp.status as ReviewStatusFilter) && sp.status !== 'all') {
    out.status = sp.status as ReviewStatusFilter;
  }
  if (
    sp.building &&
    BUILDING_VALUES.has(sp.building as ReviewBuildingFilter) &&
    sp.building !== 'all'
  ) {
    out.building = sp.building as ReviewBuildingFilter;
  }
  return out;
}

/** Build a `/beithady/analytics/reviews?...` URL preserving the other
 *  filter params and toggling the named one to `value`. Passing the
 *  current value clears it. */
function filterHref(
  current: { rating?: string; status?: string; building?: string },
  patch: { rating?: string; status?: string; building?: string },
): string {
  const next = { ...current, ...patch };
  // Clearing semantics: 'all' / undefined / empty → drop the param.
  const params = new URLSearchParams();
  if (next.rating && next.rating !== 'all') params.set('rating', next.rating);
  if (next.status && next.status !== 'all') params.set('status', next.status);
  if (next.building && next.building !== 'all') params.set('building', next.building);
  const qs = params.toString();
  return qs ? `/beithady/analytics/reviews?${qs}` : '/beithady/analytics/reviews';
}

type SearchParams = Promise<{ rating?: string; status?: string; building?: string }>;

export default async function ReviewsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireBeithadyPermission('analytics', 'read');
  const sp = (await searchParams) || {};
  const filters = parseFilters(sp);
  const reviews = await listReviewsWithReplies(50, filters);
  const filtered =
    !!filters.stars || !!filters.status || !!filters.building;

  const drafted = reviews.filter(r => r.reply_status === 'draft').length;
  const sent = reviews.filter(r => r.reply_status === 'sent').length;
  const ungenerated = reviews.filter(r => !r.reply_id && r.text).length;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Analytics', href: '/beithady/analytics' },
      { label: 'Reviews' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics · Reviews"
        title="Review responses"
        subtitle="AI-drafted replies in the guest's language. Edit, approve, send. Daily cron auto-drafts new reviews."
        right={
          <Link href="/beithady/analytics" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> Analytics
          </Link>
        }
      />

      <FilterBar sp={sp} />

      <section className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-xs">
        <Stat label={filtered ? 'Filtered' : 'Reviews'} value={reviews.length} />
        <Stat label="Drafts pending" value={drafted} accent="amber" />
        <Stat label="Sent" value={sent} accent="emerald" />
        <Stat label="Need draft" value={ungenerated} accent="cyan" />
      </section>

      {ungenerated > 0 && (
        <div className="ix-card border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950 p-3 text-xs flex items-center gap-2">
          <Sparkles size={14} className="text-cyan-600" />
          <span>{ungenerated} reviews don&apos;t have an AI draft yet. The daily cron picks up 20 per run, or click "Generate" on any row.</span>
        </div>
      )}

      <div className="ix-card overflow-hidden">
        {reviews.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {filtered ? (
              <>
                No reviews match the current filters.{' '}
                <Link
                  href="/beithady/analytics/reviews"
                  className="font-medium text-cyan-700 dark:text-cyan-400 hover:underline"
                >
                  Clear filters
                </Link>
              </>
            ) : (
              'No reviews synced yet. Run the Guesty sync first.'
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {reviews.map(r => (
              <li key={r.review_id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <RatingStars rating={r.rating} />
                    {r.channel && (
                      <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${CHANNEL_BADGE[r.channel] || 'bg-slate-100 text-slate-700'}`}>
                        {r.channel.replace('2', '')}
                      </span>
                    )}
                    {r.listing_nickname && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {r.listing_nickname}
                      </span>
                    )}
                    {r.building_code && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                        {r.building_code}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500">{fmtCairoDate(r.created_at)}</span>
                  </div>
                  {r.reply_status && (
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${
                      r.reply_status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                      r.reply_status === 'approved' ? 'bg-cyan-100 text-cyan-700' :
                      r.reply_status === 'failed' ? 'bg-rose-100 text-rose-700' :
                      r.reply_status === 'dismissed' ? 'bg-slate-100 text-slate-600' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {r.reply_status}
                    </span>
                  )}
                </div>

                <blockquote className="text-sm text-slate-700 dark:text-slate-200 italic border-l-2 border-slate-300 dark:border-slate-600 pl-3 whitespace-pre-wrap">
                  {r.text}
                </blockquote>

                {/* Reply section */}
                {!r.reply_id ? (
                  <form action={generateReplyAction} className="pt-2">
                    <input type="hidden" name="review_id" value={r.review_id} />
                    <button type="submit" className="ix-btn-primary text-xs">
                      <Sparkles size={12} /> Generate AI draft (~$0.001)
                    </button>
                  </form>
                ) : (
                  <ReplyEditor
                    reviewId={r.review_id}
                    replyId={r.reply_id}
                    aiDraft={r.ai_draft}
                    agentFinal={r.agent_final}
                    language={r.reply_language}
                    status={r.reply_status}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center">
        AI drafts use Claude haiku-4-5. Sending replies back to Guesty/OTA is tier-gated;
        when the API isn&apos;t available, the agent uses the deep-link to reply in Guesty.
      </p>
    </BeithadyShell>
  );
}

function ReplyEditor({
  reviewId, replyId, aiDraft, agentFinal, language, status,
}: {
  reviewId: string;
  replyId: string;
  aiDraft: string | null;
  agentFinal: string | null;
  language: string | null;
  status: string | null;
}) {
  const isSent = status === 'sent';
  const isFailed = status === 'failed';
  const guestyDeepLink = `https://app.guesty.com/reviews/${reviewId}`;

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Sparkles size={12} className="text-violet-600" />
        <span className="font-semibold">AI draft</span>
        {language && <span className="text-[10px] uppercase text-slate-500">{language}</span>}
        {isFailed && (
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 font-semibold ml-auto">
            <AlertTriangle size={10} /> Last send failed
          </span>
        )}
      </div>
      <form action={sendReplyAction} className="space-y-2">
        <input type="hidden" name="reply_id" value={replyId} />
        <textarea
          name="agent_final"
          rows={3}
          defaultValue={agentFinal || aiDraft || ''}
          disabled={isSent}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {!isSent && (
            <button type="submit" className="ix-btn-primary text-xs">
              <Send size={12} /> Send to Guesty
            </button>
          )}
          {!isSent && (
            <>
              <SubmitTo formAction={regenerateReplyAction} replyId={replyId} label="Regenerate" icon={RefreshCw} />
              <SubmitTo formAction={dismissReplyAction} replyId={replyId} label="Dismiss" icon={X} />
            </>
          )}
          <a href={guestyDeepLink} target="_blank" rel="noopener noreferrer" className="ix-btn-secondary text-xs ml-auto">
            <ExternalLink size={12} /> Reply in Guesty
          </a>
        </div>
      </form>
      {isSent && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
          <Check size={11} /> Sent. Edits go through Guesty directly.
        </p>
      )}
    </div>
  );
}

function SubmitTo({
  formAction, replyId, label, icon: Icon,
}: {
  formAction: (formData: FormData) => Promise<void>;
  replyId: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="reply_id" value={replyId} />
      <button type="submit" className="ix-btn-secondary text-xs">
        <Icon size={12} /> {label}
      </button>
    </form>
  );
}

function RatingStars({ rating }: { rating: number | null }) {
  if (rating == null) {
    return <span className="text-xs text-slate-400">unrated</span>;
  }
  // Convert Airbnb 1-5 vs Guesty 1-10 — display normalized stars
  const normalized = rating > 5 ? Math.round(rating / 2) : Math.round(rating);
  const tone = normalized >= 5 ? 'text-emerald-600' : normalized >= 4 ? 'text-amber-600' : 'text-rose-600';
  return (
    <span className={`inline-flex items-center gap-0.5 ${tone} text-sm tabular-nums`}>
      <Star size={12} fill="currentColor" />
      {rating}
      <span className="text-[10px] text-slate-400 ml-1">{rating > 5 ? '/10' : '/5'}</span>
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'amber' | 'emerald' | 'cyan' }) {
  const cls = accent === 'amber' ? 'text-amber-700 dark:text-amber-300'
    : accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'cyan' ? 'text-cyan-700 dark:text-cyan-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function FilterBar({
  sp,
}: {
  sp: { rating?: string; status?: string; building?: string };
}) {
  const activeRating = sp.rating && /^[1-5]$/.test(sp.rating) ? sp.rating : 'all';
  const activeStatus = sp.status && STATUS_VALUES.has(sp.status as ReviewStatusFilter) ? sp.status : 'all';
  const activeBuilding = sp.building && BUILDING_VALUES.has(sp.building as ReviewBuildingFilter) ? sp.building : 'all';
  const anyActive = activeRating !== 'all' || activeStatus !== 'all' || activeBuilding !== 'all';

  return (
    <section className="ix-card p-3 space-y-2.5">
      <FilterGroup label="Rating">
        <PillLink href={filterHref(sp, { rating: undefined })} active={activeRating === 'all'}>
          All
        </PillLink>
        {[5, 4, 3, 2, 1].map((n) => (
          <PillLink
            key={n}
            href={filterHref(sp, { rating: String(n) })}
            active={activeRating === String(n)}
          >
            <Star size={11} className="inline mr-0.5" fill="currentColor" />
            {n}★
          </PillLink>
        ))}
      </FilterGroup>
      <FilterGroup label="Replied status">
        {STATUS_OPTIONS.map((opt) => (
          <PillLink
            key={opt.value}
            href={filterHref(sp, { status: opt.value })}
            active={activeStatus === opt.value}
          >
            {opt.label}
          </PillLink>
        ))}
      </FilterGroup>
      <FilterGroup label="Building">
        {BUILDING_OPTIONS.map((opt) => (
          <PillLink
            key={opt.value}
            href={filterHref(sp, { building: opt.value })}
            active={activeBuilding === opt.value}
          >
            {opt.label}
          </PillLink>
        ))}
      </FilterGroup>
      {anyActive && (
        <div className="flex justify-end">
          <Link
            href="/beithady/analytics/reviews"
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2"
          >
            Clear all filters
          </Link>
        </div>
      )}
    </section>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 min-w-[7rem]">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function PillLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const cls = active
    ? 'bg-cyan-700 text-white border-cyan-700 dark:bg-cyan-600 dark:border-cyan-600'
    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800';
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${cls}`}
    >
      {children}
    </Link>
  );
}
