import Link from 'next/link';
import { Sparkles, AlertCircle, Copy, Info } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishGooglePMaxAction } from '../../actions';
import { buildPmaxDefaultsFromMetaCampaign, buildPmaxDefaultsFromIgMediaItem, type PmaxDefaults } from '@/lib/beithady/ads/duplicate-to-google';
import { listIgMedia } from '@/lib/beithady/ads/meta-client';
import { listPickerVideos } from '@/lib/beithady/youtube/picker';
import { EmbeddedPicker } from '@/app/beithady/gallery/youtube/picker/_components/embedded-picker';
import { YouTubeSourceBanner } from '@/app/beithady/gallery/youtube/picker/_components/youtube-source-banner';
import { AiPmaxComposer } from './_components/ai-pmax-composer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function GooglePMaxPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from_meta?: string; from_ig?: string; yt_video_id?: string; ads_yt_video_id?: string; source?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const { data: accountsRaw } = await sb
    .from('ads_accounts')
    .select('id, name, external_id, google_refresh_token, status')
    .eq('platform', 'google')
    .order('id');
  const accounts = (accountsRaw as Array<{ id: number; name: string; external_id: string; google_refresh_token: string | null; status: string }> | null) || [];

  // V1.2 cross-post: optional YouTube source pre-fill via ?yt_video_id=…
  const ytVideoIdParam = sp.yt_video_id ?? null;
  const adsYtVideoIdParam = sp.ads_yt_video_id ? Number(sp.ads_yt_video_id) : null;

  let ytSource: null | { yt_video_id: string; title: string; duration_seconds: number | null; is_shorts: boolean; view_count: number } = null;
  if (ytVideoIdParam) {
    // Look up the YouTube video in local DB to populate banner
    const { data: ytRow } = await sb.from('ads_youtube_videos')
      .select('id, youtube_video_id, title, duration_seconds, is_shorts, view_count')
      .eq('youtube_video_id', ytVideoIdParam).maybeSingle();
    if (ytRow) {
      const r = ytRow as Record<string, unknown>;
      ytSource = {
        yt_video_id: ytVideoIdParam,
        title: String(r.title),
        duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
        is_shorts: Boolean(r.is_shorts),
        view_count: Number(r.view_count ?? 0),
      };
    } else {
      // YT-only video — not in our DB. Banner uses just the ID.
      ytSource = {
        yt_video_id: ytVideoIdParam,
        title: ytVideoIdParam,
        duration_seconds: null,
        is_shorts: false,
        view_count: 0,
      };
    }
  }

  // Load YouTube picker items for the embedded source picker (best-effort,
  // cached 5min in listPickerVideos). Only load if a YouTube ads account exists.
  const { data: ytAccount } = await sb.from('ads_accounts')
    .select('id').eq('platform', 'youtube').limit(1).maybeSingle();
  const pickerItems = ytAccount
    ? await listPickerVideos((ytAccount as { id: number }).id).catch(() => [])
    : [];

  // Fetch IG posts for the picker (best-effort, non-blocking)
  const mediaResult = await listIgMedia('', 20).catch(() => null);

  // Pre-fill from a Meta campaign or an IG post
  let prefill: PmaxDefaults | null = null;
  const fromMetaId = Number.parseInt(sp.from_meta || '', 10);
  const fromIgId = sp.from_ig || null;

  if (fromIgId && mediaResult?.ok) {
    const post = mediaResult.media.find(m => m.id === fromIgId) ?? null;
    if (post) prefill = await buildPmaxDefaultsFromIgMediaItem(post);
  } else if (Number.isFinite(fromMetaId) && fromMetaId > 0) {
    prefill = await buildPmaxDefaultsFromMetaCampaign(fromMetaId);
  }

  const defaultFinalUrl = prefill?.finalUrl || 'https://beithady.com';
  const defaultCampaignName = prefill?.campaignName || '';
  const defaultBudget = prefill?.dailyBudgetUsd ?? 30;
  const defaultCap = prefill?.monthlyBudgetCapUsd ?? '';
  const defaultBuildings = (prefill?.buildingCodes || []).join(', ');
  const defaultCountries = (prefill?.targetCountriesIso?.length ? prefill.targetCountriesIso : ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'JO']).join(', ');
  const defaultHeadlines = (prefill?.headlines || []).join('\n');
  const defaultLongHeadlines = (prefill?.longHeadlines || []).join('\n');
  const defaultDescriptions = (prefill?.descriptions || []).join('\n');

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Google PMax' }]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — Google Performance Max"
        subtitle="Search + Display + YouTube + Discover + Gmail + Maps in one campaign. Google's AI optimizes placement mix. Closest practical alternative to Hotel Ads without a property feed."
      />

      <AdsTabs active="google" />

      {ytSource && (
        <YouTubeSourceBanner
          ytVideoId={ytSource.yt_video_id}
          title={ytSource.title}
          durationSeconds={ytSource.duration_seconds}
          isShorts={ytSource.is_shorts}
          viewCount={ytSource.view_count}
          publishPagePath="/beithady/ads/google/pmax"
        />
      )}

      {sp.error && (
        <div id="publish-error" className="ix-card border-rose-400 dark:border-rose-600 bg-rose-100 dark:bg-rose-950 p-4 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <strong className="text-rose-700 dark:text-rose-300">Publish failed</strong>
          </div>
          <pre className="font-mono text-xs text-rose-800 dark:text-rose-200 whitespace-pre-wrap break-all">{sp.error}</pre>
          <script dangerouslySetInnerHTML={{ __html: `document.getElementById('publish-error')?.scrollIntoView({behavior:'smooth'})` }} />
        </div>
      )}

      {/* YouTube source picker (V1.2 cross-post) */}
      {pickerItems.length > 0 && !ytSource && (
        <section className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Or pick from YouTube</h2>
          <EmbeddedPicker
            items={pickerItems}
            platform="google_pmax"
            publishPagePath="/beithady/ads/google/pmax"
          />
        </section>
      )}

      {/* IG post picker */}
      {mediaResult?.ok && mediaResult.media.length > 0 && (
        <div className="ix-card p-3">
          <p className="text-xs font-semibold mb-2 text-slate-500 dark:text-slate-400">Source from Instagram post — click to pre-fill copy + image</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mediaResult.media.map(post => {
              const thumb = post.thumbnail_url || post.media_url;
              const selected = fromIgId === post.id;
              return (
                <a
                  key={post.id}
                  href={`?from_ig=${post.id}`}
                  title={post.caption?.slice(0, 80) || ''}
                  className={`shrink-0 rounded overflow-hidden border-2 transition-colors ${
                    selected
                      ? 'border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
                      : 'border-transparent hover:border-slate-400'
                  }`}
                >
                  {thumb
                    ? <img src={thumb} alt="" className="w-16 h-16 object-cover" />
                    : <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-500">no img</div>
                  }
                </a>
              );
            })}
          </div>
        </div>
      )}

      {prefill?.found && (
        <div className="ix-card border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2">
            <Copy size={14} className="text-violet-600 dark:text-violet-300 shrink-0" />
            <strong>{fromIgId ? 'Sourced from Instagram post' : 'Duplicated from Meta campaign'}</strong>
            {!fromIgId && <Link href={`/beithady/ads/campaigns/${fromMetaId}`} className="ix-link text-xs">view original →</Link>}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {fromIgId
              ? 'Headlines and descriptions mined from the post caption. Review before publishing — PMax has stricter character limits.'
              : 'Pre-filled headlines, descriptions, budget, locations, and landing URL from the Meta campaign. Review and edit before publishing — PMax has stricter character limits and accepts different audience signals.'}
          </div>
          {prefill.marketingImageUrl && (
            <div className="flex items-start gap-3 mt-2 p-2 bg-white/40 dark:bg-slate-900/40 rounded">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prefill.marketingImageUrl} alt="Meta ad creative" className="w-16 h-16 object-cover rounded shrink-0" />
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                Meta ad creative — auto-uploaded as square or landscape (whichever fits). BH wordmark, stacked logo, and BH icon uploaded automatically as the other slots.
              </div>
            </div>
          )}
          {prefill.notes.length > 0 && (
            <ul className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 space-y-1">
              {prefill.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Info size={11} className="shrink-0 mt-0.5" /><span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="ix-card p-3 border-cyan-200 bg-cyan-50 dark:bg-cyan-950 text-xs">
        After publishing, complete the campaign in Google Ads UI:<br/>
        <strong>All assets uploaded automatically:</strong> text, Meta creative image, BH wordmark (landscape), BH stacked logo (square), and BH icon (logo slot). No manual image uploads needed.
      </div>

      {accounts.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No Google Ads account configured yet.</p>
          <Link className="ix-link" href="/beithady/ads/google/accounts">Add a Google account →</Link>
        </div>
      ) : (
        <form action={publishGooglePMaxAction} className="ix-card p-5 space-y-4">
          {prefill?.marketingImageUrl && (
            <input type="hidden" name="marketing_image_url" value={prefill.marketingImageUrl} />
          )}
          <input type="hidden" name="youtube_video_id" value={ytSource?.yt_video_id ?? ''} />
          <input type="hidden" name="ads_yt_video_id" value={adsYtVideoIdParam ?? ''} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Account" htmlFor="account_id">
              <select id="account_id" name="account_id" required className="ix-input">
                {accounts.map(a => (
                  <option key={a.id} value={a.id} disabled={!a.google_refresh_token}>
                    {a.name} ({a.external_id}){!a.google_refresh_token ? ' — not connected' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campaign name (optional)" htmlFor="campaign_name">
              <input id="campaign_name" name="campaign_name" className="ix-input" placeholder="Auto-generated if blank" defaultValue={defaultCampaignName} />
            </Field>
            <Field label="Daily budget (USD)" htmlFor="daily_budget_usd">
              <input id="daily_budget_usd" name="daily_budget_usd" type="number" min="5" step="1" defaultValue={defaultBudget} required className="ix-input" />
            </Field>
            <Field label="Monthly cap (USD, optional)" htmlFor="monthly_budget_cap_usd">
              <input id="monthly_budget_cap_usd" name="monthly_budget_cap_usd" type="number" min="1" step="10" className="ix-input" placeholder="1000" defaultValue={defaultCap} />
            </Field>
            <Field label="Business name (≤25 chars)" htmlFor="business_name">
              <input id="business_name" name="business_name" maxLength={25} defaultValue="Beit Hady" className="ix-input" />
            </Field>
            <Field label="Final URL" htmlFor="final_url">
              <input id="final_url" name="final_url" type="url" defaultValue={defaultFinalUrl} className="ix-input font-mono text-xs" />
            </Field>
            <Field label="Building codes (comma-separated)" htmlFor="building_codes">
              <input id="building_codes" name="building_codes" className="ix-input font-mono text-xs" placeholder="BH-435, BH-26" defaultValue={defaultBuildings} />
            </Field>
            <Field label="Target countries (ISO codes)" htmlFor="target_countries">
              <input id="target_countries" name="target_countries" className="ix-input font-mono text-xs" placeholder="EG, SA, AE, KW" defaultValue={defaultCountries} />
            </Field>
          </div>

          <AiPmaxComposer
            defaultHeadlines={defaultHeadlines}
            defaultLongHeadlines={defaultLongHeadlines}
            defaultDescriptions={defaultDescriptions}
          />

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">PMax lands PAUSED. After saving, attach images in Google Ads UI and activate.</p>
            <button type="submit" className="ix-btn-primary">
              <Sparkles size={14} /> Publish (PAUSED)
            </button>
          </div>
        </form>
      )}
    </BeithadyShell>
  );
}

function Field({ label, htmlFor, children, className = '' }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold">{label}</label>
      {children}
    </div>
  );
}
