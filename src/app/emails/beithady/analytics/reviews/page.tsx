import Link from 'next/link';
import { Star, Sparkles, Send, RefreshCw, Check, X, ChevronLeft, AlertTriangle, ExternalLink } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listReviewsWithReplies } from '@/lib/beithady/pipeline/review-replies';
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

export default async function ReviewsPage() {
  await requireBeithadyPermission('analytics', 'read');
  const reviews = await listReviewsWithReplies(50);

  const drafted = reviews.filter(r => r.reply_status === 'draft').length;
  const sent = reviews.filter(r => r.reply_status === 'sent').length;
  const ungenerated = reviews.filter(r => !r.reply_id && r.text).length;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Analytics', href: '/emails/beithady/analytics' },
      { label: 'Reviews' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics · Reviews"
        title="Review responses"
        subtitle="AI-drafted replies in the guest's language. Edit, approve, send. Daily cron auto-drafts new reviews."
        right={
          <Link href="/emails/beithady/analytics" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> Analytics
          </Link>
        }
      />

      <section className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Reviews" value={reviews.length} />
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
            No reviews synced yet. Run the Guesty sync first.
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
