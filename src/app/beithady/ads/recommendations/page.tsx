import Link from 'next/link';
import { Sparkles, TrendingUp, AlertCircle, CheckCircle2, Info, Gauge, RefreshCw } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { loadMetaCredentials, listMetaRecommendations } from '@/lib/beithady/ads/meta-client';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { fmtCairoDate } from '@/lib/fmt-date';
import { applyRecommendationAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TYPE_LABELS: Record<string, string> = {
  PARTNERSHIP_ADS: 'Use partnership ads',
  ADVANTAGE_PLUS_CREATIVE: 'Advantage+ creative enhancements',
  ADVANTAGE_PLUS_CREATIVE_ENHANCEMENT: 'Advantage+ creative enhancements',
  OPTIMIZE_AD_CREATIVE: 'Optimize ad creative',
  CREATIVE_FEATURES: 'Creative enhancements',
  ADVANTAGE_PLUS_AUDIENCE: 'Advantage+ audience',
  AUDIENCE_OPTIMIZATION: 'Audience optimization',
  ADVANTAGE_PLUS_PLACEMENTS: 'Advantage+ placements',
  EXPAND_PLACEMENTS: 'Expand placements',
  REELS_AS_PLACEMENT: 'Add Reels placement',
  REELS_FORMAT: 'Optimize Reels format (9:16)',
  VIDEO_AD: 'Use a video ad',
  CAROUSEL_AD: 'Try a carousel ad',
  IMAGE_QUALITY: 'Improve image quality',
  TEXT_OVERLAY: 'Reduce text on image',
  PIXEL_INSTALLATION: 'Install Meta Pixel',
  CONVERSIONS_API: 'Set up Conversions API',
  CATALOG_CREATION: 'Create a product catalog',
  DOMAIN_VERIFICATION: 'Verify your domain',
};

// Types we can apply directly from the app
const APPLIABLE_TYPES = new Set([
  'ADVANTAGE_PLUS_CREATIVE',
  'ADVANTAGE_PLUS_CREATIVE_ENHANCEMENT',
  'OPTIMIZE_AD_CREATIVE',
  'CREATIVE_FEATURES',
  'ADVANTAGE_PLUS_AUDIENCE',
  'AUDIENCE_OPTIMIZATION',
  'ADVANTAGE_PLUS_PLACEMENTS',
  'EXPAND_PLACEMENTS',
]);

function humanizeType(t: string): string {
  return TYPE_LABELS[t] ?? t.toLowerCase().split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 80) return 'text-rose-600';
  if (score >= 50) return 'text-amber-600';
  if (score >= 20) return 'text-emerald-600';
  return 'text-emerald-700';
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'No data';
  if (score >= 80) return 'High potential — apply recommendations';
  if (score >= 50) return 'Moderate potential';
  if (score >= 20) return 'Mostly optimized';
  return 'Fully optimized';
}

export default async function MetaRecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string; msg?: string; error?: string; manual?: string; reason?: string; refresh?: string }>;
}) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;

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
        subtitle="ML-driven optimization suggestions. Apply directly from here — no need to leave the dashboard."
      />

      <AdsTabs active="recommendations" />

      {/* Result banners */}
      {sp.applied && (
        <div className="ix-card border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-3 text-sm flex items-start gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">
              Applied {humanizeType(sp.applied)}
            </p>
            {sp.msg && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">{sp.msg}</p>}
          </div>
        </div>
      )}
      {sp.error && (
        <div className="ix-card border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-3 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-800 dark:text-rose-200">
              Failed: {humanizeType(sp.error)}
            </p>
            {sp.reason && <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 font-mono">{sp.reason}</p>}
          </div>
        </div>
      )}
      {sp.manual && (
        <div className="ix-card border-sky-200 bg-sky-50 dark:bg-sky-950 dark:border-sky-800 p-3 text-sm flex items-start gap-2">
          <Info size={16} className="text-sky-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sky-800 dark:text-sky-200">
              Manual setup needed: {humanizeType(sp.manual)}
            </p>
            {sp.reason && <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">{sp.reason}</p>}
          </div>
        </div>
      )}

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
          {/* Opportunity score gauge + refresh */}
          <section className="ix-card p-5 flex items-center gap-5">
            <div className={`flex-shrink-0 w-20 h-20 rounded-full border-4 border-slate-200 dark:border-slate-700 flex items-center justify-center ${scoreColor(result.data.opportunity_score)}`}>
              <span className="text-2xl font-bold">{result.data.opportunity_score ?? '—'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Gauge size={14} /> Opportunity score
              </h2>
              <p className={`text-xs mt-1 ${scoreColor(result.data.opportunity_score)}`}>
                {scoreLabel(result.data.opportunity_score)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {result.data.recommendations.length} active recommendation{result.data.recommendations.length === 1 ? '' : 's'}.
                Higher score = more room to improve.
              </p>
            </div>
            <Link
              href={`/beithady/ads/recommendations?refresh=${Date.now()}`}
              className="ix-btn-secondary text-xs inline-flex items-center gap-1.5 flex-shrink-0"
            >
              <RefreshCw size={11} /> Refresh
            </Link>
          </section>

          {/* Recommendations list */}
          {result.data.recommendations.length === 0 ? (
            <div className="ix-card p-6 text-sm text-slate-500 text-center">
              <Sparkles size={20} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">All caught up</p>
              <p className="text-xs mt-1">No active recommendations from Meta right now.</p>
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
                const canApply = APPLIABLE_TYPES.has(rec.type);
                return (
                  <div key={`${rec.type}-${i}`} className="ix-card p-4 flex items-start gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center">
                      <TrendingUp size={16} className="text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{humanizeType(rec.type)}</h3>
                        {points && (
                          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded px-1.5 py-0.5">
                            +{points} pts
                          </span>
                        )}
                        {lift && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                            {lift}
                          </span>
                        )}
                      </div>
                      {body && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{body}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="font-mono">{rec.type.toLowerCase()}</span>
                        <span>·</span>
                        <span>{fmtCairoDate(rec.recommendation_time)}</span>
                        {!canApply && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 dark:text-amber-400">manual only</span>
                          </>
                        )}
                      </div>
                    </div>
                    <form action={applyRecommendationAction} className="flex-shrink-0">
                      <input type="hidden" name="type" value={rec.type} />
                      <button
                        type="submit"
                        className={`text-xs inline-flex items-center gap-1.5 ${canApply ? 'ix-btn-primary' : 'ix-btn-secondary'}`}
                      >
                        {canApply ? <Sparkles size={11} /> : <Info size={11} />}
                        {canApply ? 'Apply now' : 'Why manual?'}
                      </button>
                    </form>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      <p className="text-[11px] text-slate-400 mt-3">
        Data is pulled live from Meta's Graph API. Applying triggers the Meta Marketing API directly — no browser redirect to Meta. Auditable in <Link href="/beithady/settings/audit" className="ix-link">audit log</Link>.
      </p>
    </BeithadyShell>
  );
}
