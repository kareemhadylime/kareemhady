import Link from 'next/link';
import { Sparkles, TrendingUp, AlertCircle, ExternalLink, Gauge } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { loadMetaCredentials, listMetaRecommendations } from '@/lib/beithady/ads/meta-client';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { fmtCairoDate } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Friendly labels for Meta's machine-codes
const TYPE_LABELS: Record<string, string> = {
  PARTNERSHIP_ADS: 'Use partnership ads',
  ADVANTAGE_PLUS_CREATIVE: 'Advantage+ creative enhancements',
  ADVANTAGE_PLUS_AUDIENCE: 'Advantage+ audience',
  ADVANTAGE_PLUS_PLACEMENTS: 'Advantage+ placements',
  REELS_AS_PLACEMENT: 'Add Reels placement',
  REELS_FORMAT: 'Optimize Reels format (9:16)',
  VIDEO_AD: 'Use a video ad',
  CAROUSEL_AD: 'Try a carousel ad',
  IMAGE_QUALITY: 'Improve image quality',
  TEXT_OVERLAY: 'Reduce text on image',
  AUDIENCE_OPTIMIZATION: 'Optimize audience targeting',
  PIXEL_INSTALLATION: 'Install Meta Pixel',
  CONVERSIONS_API: 'Set up Conversions API',
};

function humanizeType(t: string): string {
  return TYPE_LABELS[t] ?? t.toLowerCase().split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 80) return 'text-rose-600';      // lots of room to improve
  if (score >= 50) return 'text-amber-600';
  if (score >= 20) return 'text-emerald-600';
  return 'text-emerald-700';
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'No data';
  if (score >= 80) return 'High potential';
  if (score >= 50) return 'Moderate potential';
  if (score >= 20) return 'Mostly optimized';
  return 'Fully optimized';
}

export default async function MetaRecommendationsPage() {
  await requireBeithadyPermission('ads', 'read');

  const creds = await loadMetaCredentials();

  if (!creds.ok) {
    return (
      <BeithadyShell
        breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Recommendations' }]}
        containerClass="max-w-5xl"
      >
        <BeithadyHeader
          eyebrow="Beit Hady · Ads"
          title="Meta recommendations"
          subtitle="ML-driven optimization suggestions from your Meta ad account"
        />
        <AdsTabs active="recommendations" />
        <div className="ix-card border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Meta not configured</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Connect Meta Marketing credentials before recommendations can load.{' '}
              <Link href="/beithady/ads/accounts" className="underline">Go to Accounts →</Link>
            </p>
          </div>
        </div>
      </BeithadyShell>
    );
  }

  const result = await listMetaRecommendations(creds.creds.adAccountId, creds.creds.token);

  return (
    <BeithadyShell
      breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Recommendations' }]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Meta recommendations"
        subtitle="ML-driven optimization suggestions from your Meta ad account. Apply directly in Meta Ads Manager."
      />

      <AdsTabs active="recommendations" />

      {!result.ok ? (
        <div className="ix-card border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-4 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load recommendations</p>
            <p className="text-xs font-mono mt-1">{result.error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Opportunity score gauge */}
          <section className="ix-card p-5 flex items-center gap-5">
            <div className={`flex-shrink-0 w-20 h-20 rounded-full border-4 border-slate-200 dark:border-slate-700 flex items-center justify-center ${scoreColor(result.data.opportunity_score)}`}>
              <span className="text-2xl font-bold">
                {result.data.opportunity_score ?? '—'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Gauge size={14} /> Opportunity score
              </h2>
              <p className={`text-xs mt-1 ${scoreColor(result.data.opportunity_score)}`}>
                {scoreLabel(result.data.opportunity_score)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Applying all {result.data.recommendations.length} recommendation{result.data.recommendations.length === 1 ? '' : 's'} could improve performance.
                Lower score = more optimized.
              </p>
            </div>
            <a
              href="https://adsmanager.facebook.com/adsmanager/manage/accounts"
              target="_blank"
              rel="noreferrer"
              className="ix-btn-secondary text-xs inline-flex items-center gap-1.5 flex-shrink-0"
            >
              Open Ads Manager <ExternalLink size={11} />
            </a>
          </section>

          {/* Recommendations list */}
          {result.data.recommendations.length === 0 ? (
            <div className="ix-card p-6 text-sm text-slate-500 text-center">
              <Sparkles size={20} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">All caught up</p>
              <p className="text-xs mt-1">No active recommendations from Meta right now. Check back after running campaigns longer.</p>
            </div>
          ) : (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions to take ({result.data.recommendations.length})
              </h2>
              {result.data.recommendations.map((rec, i) => {
                const lift = rec.recommendation_content.lift_estimate;
                const points = rec.recommendation_content.opportunity_score_lift;
                const body = rec.recommendation_content.body;
                return (
                  <div
                    key={`${rec.type}-${i}`}
                    className="ix-card p-4 flex items-start gap-3"
                  >
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center">
                      <TrendingUp size={16} className="text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{humanizeType(rec.type)}</h3>
                        {points && (
                          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded px-1.5 py-0.5">
                            +{points} points
                          </span>
                        )}
                        {lift && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                            {lift}
                          </span>
                        )}
                      </div>
                      {body && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {body}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="font-mono">{rec.type.toLowerCase()}</span>
                        <span>·</span>
                        <span>{fmtCairoDate(rec.recommendation_time)}</span>
                      </div>
                    </div>
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ix-btn-primary text-xs inline-flex items-center gap-1.5 flex-shrink-0"
                    >
                      Apply in Meta <ExternalLink size={11} />
                    </a>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      <p className="text-[11px] text-slate-400 mt-3">
        Data is pulled live from Meta's Graph API each time you load this page. Applying a recommendation opens Meta Ads Manager in a new tab — once applied there, refresh this page to see updated scores.
      </p>
    </BeithadyShell>
  );
}
