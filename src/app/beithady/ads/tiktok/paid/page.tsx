import Link from 'next/link';
import { Music2, AlertCircle } from 'lucide-react';
import { TargetGroupPicker } from '../../_components/target-group-picker';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishTikTokPaidAction } from '../../actions';
import { listTikTokIdentityVideos } from '@/lib/beithady/ads/tiktok-paid-publish';
import { SparkPicker } from './_components/spark-picker';
import { buildBhWaLink } from '@/lib/beithady/ads/platforms';
import { listPickerVideos } from '@/lib/beithady/youtube/picker';
import { EmbeddedPicker } from '@/app/beithady/gallery/youtube/picker/_components/embedded-picker';
import { YouTubeSourceBanner } from '@/app/beithady/gallery/youtube/picker/_components/youtube-source-banner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function TikTokPaidPage({ searchParams }: { searchParams: Promise<{ error?: string; yt_video_id?: string; ads_yt_video_id?: string; source?: string }> }) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: accountsRaw }, { data: signalsRaw }] = await Promise.all([
    sb
      .from('ads_accounts')
      .select('id, name, tiktok_advertiser_id, tiktok_identity_id, status')
      .eq('platform', 'tiktok')
      .order('id'),
    sb
      .from('beithady_market_signals')
      .select('origin_country, signal_type, delta_pct')
      .eq('signal_type', 'under_indexed')
      .order('delta_pct', { ascending: true })
      .limit(8),
  ]);
  const accounts = (accountsRaw as Array<{ id: number; name: string; tiktok_advertiser_id: string | null; tiktok_identity_id: string | null; status: string }> | null) || [];
  const ready = accounts.filter(a => a.status === 'active' && a.tiktok_advertiser_id && a.tiktok_identity_id);
  const suggestedCountries = (signalsRaw as Array<{ origin_country: string; delta_pct: number | null }> | null) || [];

  // Fetch the identity's organic TikTok posts for the Spark Ads picker.
  // Uses the first ready account — if there are multiple TikTok identities,
  // future polish could refetch when the account dropdown changes.
  const sparkRes = ready.length > 0
    ? await listTikTokIdentityVideos(ready[0].id, 30).catch(() => null)
    : null;
  const sparkPosts = sparkRes?.ok ? sparkRes.videos : [];

  // V1.2 cross-post: optional YouTube source pre-fill via ?yt_video_id=…
  const ytVideoIdParam = sp.yt_video_id ?? null;
  const adsYtVideoIdParam = sp.ads_yt_video_id ? Number(sp.ads_yt_video_id) : null;

  let ytSource: null | {
    yt_video_id: string;
    title: string;
    duration_seconds: number | null;
    is_shorts: boolean;
    view_count: number;
    building_code: string | null;
    source_url: string | null;
  } = null;

  if (ytVideoIdParam) {
    const { data: ytRow } = await sb.from('ads_youtube_videos')
      .select('id, youtube_video_id, title, duration_seconds, is_shorts, view_count, building_code, source_url')
      .eq('youtube_video_id', ytVideoIdParam).maybeSingle();
    if (ytRow) {
      const r = ytRow as Record<string, unknown>;
      ytSource = {
        yt_video_id: String(r.youtube_video_id),
        title: String(r.title),
        duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
        is_shorts: Boolean(r.is_shorts),
        view_count: Number(r.view_count ?? 0),
        building_code: (r.building_code as string | null) ?? null,
        source_url: (r.source_url as string | null) ?? null,
      };
    } else {
      ytSource = {
        yt_video_id: ytVideoIdParam,
        title: ytVideoIdParam,
        duration_seconds: null,
        is_shorts: false,
        view_count: 0,
        building_code: null,
        source_url: null,
      };
    }
  }

  // Load YouTube picker items (only if YT account connected)
  const { data: ytAccount } = await sb.from('ads_accounts')
    .select('id').eq('platform', 'youtube').limit(1).maybeSingle();
  const pickerItems = ytAccount
    ? await listPickerVideos((ytAccount as { id: number }).id).catch(() => [])
    : [];

  const defaultVideoUrl = ytSource?.source_url ?? '';
  const defaultBuildingCodes = ytSource?.building_code ?? '';

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'TikTok paid' }]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — TikTok paid ad"
        subtitle="Create a TRAFFIC objective ad pointing to WhatsApp. Lands in DISABLED state for review in TikTok Ads Manager."
      />

      <AdsTabs active="tiktok-paid" />

      {ytSource && (
        <YouTubeSourceBanner
          ytVideoId={ytSource.yt_video_id}
          title={ytSource.title}
          durationSeconds={ytSource.duration_seconds}
          isShorts={ytSource.is_shorts}
          viewCount={ytSource.view_count}
          publishPagePath="/beithady/ads/tiktok/paid"
        />
      )}

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span className="font-mono text-xs">{sp.error}</span>
        </div>
      )}

      {/* YouTube source picker (V1.2 cross-post) */}
      {pickerItems.length > 0 && !ytSource && (
        <section className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Or pick from YouTube</h2>
          <EmbeddedPicker
            items={pickerItems}
            platform="tiktok_paid"
            publishPagePath="/beithady/ads/tiktok/paid"
          />
        </section>
      )}

      {suggestedCountries.length > 0 && (
        <div className="ix-card border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950 p-3 text-xs">
          <div className="font-semibold mb-1 text-cyan-700 dark:text-cyan-200">Phase G market intel — under-indexed countries</div>
          <p className="text-slate-600 dark:text-slate-300 mb-1.5">
            Travelers from these markets are under-represented at Beithady vs the Egypt baseline. Use the TikTok geo
            picker in Ads Manager to add country-specific location IDs (TikTok IDs differ from ISO codes).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedCountries.map(s => (
              <span key={s.origin_country} className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-cyan-200 dark:border-cyan-700 font-mono">
                {s.origin_country}{s.delta_pct != null ? ` (${s.delta_pct.toFixed(1)}%)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {ready.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No TikTok account is ready to publish yet — you need a connected account with advertiser_id + identity_id.</p>
          <Link className="ix-link" href="/beithady/ads/tiktok/accounts">Configure TikTok accounts →</Link>
        </div>
      ) : (
        <form action={publishTikTokPaidAction} className="ix-card p-5 space-y-4">
          <input type="hidden" name="yt_video_id" value={ytVideoIdParam ?? ''} />
          <input type="hidden" name="ads_yt_video_id" value={adsYtVideoIdParam ?? ''} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <label htmlFor="account_id" className="text-xs font-semibold">Account</label>
              <select id="account_id" name="account_id" required className="ix-input">
                {accounts.map(a => (
                  <option key={a.id} value={a.id} disabled={!a.tiktok_advertiser_id || !a.tiktok_identity_id}>
                    {a.name} {(!a.tiktok_advertiser_id || !a.tiktok_identity_id) ? ' — not configured' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="campaign_name" className="text-xs font-semibold">Campaign name (optional)</label>
              <input id="campaign_name" name="campaign_name" className="ix-input" />
            </div>
            {/* Spark Ads / fresh upload picker — handles video_url + ad_text + tiktok_item_id */}
            <SparkPicker posts={sparkPosts} defaultVideoUrl={defaultVideoUrl} />
            <div className="space-y-1">
              <label htmlFor="daily_budget_usd" className="text-xs font-semibold">Daily budget (USD)</label>
              <input id="daily_budget_usd" name="daily_budget_usd" type="number" min="1" step="1" defaultValue="10" required className="ix-input" />
            </div>
            <div className="md:col-span-2">
              <TargetGroupPicker />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="landing_url" className="text-xs font-semibold">Landing URL</label>
              <input id="landing_url" name="landing_url" type="url" defaultValue={buildBhWaLink('Hi Beit Hady — interested')} className="ix-input font-mono text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="building_codes" className="text-xs font-semibold">Building codes (comma-separated)</label>
              <input id="building_codes" name="building_codes" className="ix-input font-mono text-xs" placeholder="BH-435, BH-26" defaultValue={defaultBuildingCodes} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="monthly_budget_cap_usd" className="text-xs font-semibold">Monthly cap (USD, optional)</label>
              <input id="monthly_budget_cap_usd" name="monthly_budget_cap_usd" type="number" min="1" step="10" className="ix-input" placeholder="500" />
              <p className="text-[11px] text-slate-500">When MTD spend reaches this, the budget-guard cron auto-pauses the campaign.</p>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-[11px] text-slate-500">Created in DISABLED state. Activate from TikTok Ads Manager after review.</p>
            <button type="submit" className="ix-btn-primary"><Music2 size={14} /> Publish (DISABLED)</button>
          </div>
        </form>
      )}
    </BeithadyShell>
  );
}
