import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { listIgMedia } from '@/lib/beithady/ads/meta-client';
import { BoostSelector } from './boost-selector';
import { listPickerVideos } from '@/lib/beithady/youtube/picker';
import { EmbeddedPicker } from '../../../gallery/youtube/picker/_components/embedded-picker';
import { YouTubeSourceBanner } from '../../../gallery/youtube/picker/_components/youtube-source-banner';
import { publishMetaVideoAdAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function InstagramBoostPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    account_id?: string;
    yt_video_id?: string;
    ads_yt_video_id?: string;
    source?: string;
    step?: string;
  }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();

  const { data: accountsRaw } = await sb
    .from('ads_accounts')
    .select('id, name, fb_page_id, fb_page_name, ig_business_id, ig_username')
    .eq('platform', 'meta')
    .order('id');

  type AccountRow = {
    id: number;
    name: string;
    fb_page_id: string | null;
    fb_page_name: string | null;
    ig_business_id: string | null;
    ig_username: string | null;
  };

  const accounts = ((accountsRaw as AccountRow[] | null) || []).filter(
    a => !!a.ig_business_id
  );

  const selectedAccountId = sp.account_id
    ? Number(sp.account_id)
    : accounts[0]?.id ?? null;
  const selectedAccount =
    accounts.find(a => a.id === selectedAccountId) ?? accounts[0] ?? null;

  // --- YouTube source detection (V1.2 cross-post fork) ---
  const ytVideoIdParam = sp.yt_video_id ?? null;
  const adsYtVideoIdParam = sp.ads_yt_video_id ? Number(sp.ads_yt_video_id) : null;
  const ytMode = !!ytVideoIdParam;

  let ytSource:
    | null
    | {
        yt_video_id: string;
        ads_youtube_video_id: number | null;
        title: string;
        description: string | null;
        duration_seconds: number | null;
        is_shorts: boolean;
        view_count: number;
        source_url: string;
        thumbnail_url: string | null;
        building_codes: string[];
      } = null;

  if (ytVideoIdParam && adsYtVideoIdParam) {
    const { data: ytRow } = await sb
      .from('ads_youtube_videos')
      .select(
        'id, youtube_video_id, title, description, duration_seconds, is_shorts, view_count, building_code, source_url, thumbnail_url'
      )
      .eq('id', adsYtVideoIdParam)
      .maybeSingle();
    if (ytRow) {
      const r = ytRow as Record<string, unknown>;
      ytSource = {
        yt_video_id: String(r.youtube_video_id),
        ads_youtube_video_id: Number(r.id),
        title: String(r.title),
        description: (r.description as string | null) ?? null,
        duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
        is_shorts: Boolean(r.is_shorts),
        view_count: Number(r.view_count ?? 0),
        source_url: r.source_url as string,
        thumbnail_url: (r.thumbnail_url as string | null) ?? null,
        building_codes: r.building_code ? [r.building_code as string] : [],
      };
    }
  }

  // Load YT picker items for embedded tab (only if a YT account is connected).
  const { data: ytAccount } = await sb
    .from('ads_accounts')
    .select('id')
    .eq('platform', 'youtube')
    .limit(1)
    .maybeSingle();
  const pickerItems = ytAccount
    ? await listPickerVideos((ytAccount as { id: number }).id)
    : [];

  let mediaList: Awaited<ReturnType<typeof listIgMedia>> | null = null;
  if (!ytMode && selectedAccount?.ig_business_id) {
    mediaList = await listIgMedia(selectedAccount.ig_business_id, 30);
  }

  return (
    <BeithadyShell
      breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Boost IG post' }]}
      containerClass="max-w-6xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Boost existing Instagram content"
        subtitle="Promote a Reel, post, or carousel you've already published. The ad keeps the organic likes + comments, which boosts social proof."
      />

      <AdsTabs active="ig-boost" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm flex items-center gap-2 font-mono">
          <AlertCircle size={14} className="text-rose-600" /> {sp.error}
          {sp.step && <span className="ml-1 text-xs text-rose-700">[step: {sp.step}]</span>}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No IG Business account resolved yet.</p>
          <Link className="ix-link" href="/beithady/ads/accounts">
            Resolve IG on a Meta row →
          </Link>
        </div>
      ) : (
        <>
          {/* Account switcher — always visible */}
          <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Account</span>
            {accounts.map(a => (
              <Link
                key={a.id}
                href={`/beithady/ads/instagram/boost?account_id=${a.id}`}
                className={`px-2 py-0.5 rounded ${
                  selectedAccountId === a.id
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {a.ig_username ? `@${a.ig_username}` : a.name}
              </Link>
            ))}
          </section>

          {/* YouTube source banner + new Meta video ad form */}
          {ytSource && selectedAccount && (
            <>
              <YouTubeSourceBanner
                ytVideoId={ytSource.yt_video_id}
                title={ytSource.title}
                durationSeconds={ytSource.duration_seconds}
                isShorts={ytSource.is_shorts}
                viewCount={ytSource.view_count}
                publishPagePath="/beithady/ads/instagram/boost"
              />

              <form action={publishMetaVideoAdAction} className="ix-card p-5 space-y-4">
                <input type="hidden" name="account_id" value={selectedAccount.id} />
                <input type="hidden" name="yt_video_id" value={ytSource.yt_video_id} />
                <input
                  type="hidden"
                  name="ads_yt_video_id"
                  value={ytSource.ads_youtube_video_id ?? ''}
                />
                <input type="hidden" name="video_url" value={ytSource.source_url} />
                <input
                  type="hidden"
                  name="thumbnail_url"
                  value={ytSource.thumbnail_url ?? ''}
                />

                <div>
                  <h2 className="text-sm font-semibold">New Meta video ad from YouTube</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Creates a fresh campaign + adset + creative + ad, all PAUSED for your
                    review in Ads Manager.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="title" className="text-xs font-semibold">
                      Title
                    </label>
                    <input
                      id="title"
                      name="title"
                      required
                      defaultValue={ytSource.title.slice(0, 80)}
                      maxLength={80}
                      className="ix-input"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="body" className="text-xs font-semibold">
                      Body / message
                    </label>
                    <textarea
                      id="body"
                      name="body"
                      rows={3}
                      defaultValue={ytSource.description?.slice(0, 200) ?? ''}
                      className="ix-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="daily_budget_usd" className="text-xs font-semibold">
                      Daily budget (USD)
                    </label>
                    <input
                      id="daily_budget_usd"
                      name="daily_budget_usd"
                      type="number"
                      min="1"
                      step="0.5"
                      defaultValue="5"
                      required
                      className="ix-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="call_to_action" className="text-xs font-semibold">
                      Call to action
                    </label>
                    <select
                      id="call_to_action"
                      name="call_to_action"
                      defaultValue="LEARN_MORE"
                      className="ix-input"
                    >
                      <option value="LEARN_MORE">Learn more</option>
                      <option value="BOOK_NOW">Book now</option>
                      <option value="SHOP_NOW">Shop now</option>
                      <option value="CONTACT_US">Contact us</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="landing_url" className="text-xs font-semibold">
                      Landing URL
                    </label>
                    <input
                      id="landing_url"
                      name="landing_url"
                      type="url"
                      defaultValue="https://wa.me/201501010103?text=Hi%20I%27d%20like%20to%20book%20at%20Beithady"
                      required
                      className="ix-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="age_min" className="text-xs font-semibold">
                      Age min
                    </label>
                    <input
                      id="age_min"
                      name="age_min"
                      type="number"
                      min="13"
                      max="65"
                      defaultValue="18"
                      className="ix-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="age_max" className="text-xs font-semibold">
                      Age max
                    </label>
                    <input
                      id="age_max"
                      name="age_max"
                      type="number"
                      min="13"
                      max="65"
                      defaultValue="65"
                      className="ix-input"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="ix-btn-primary">
                    Create Meta video ad (PAUSED)
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Existing "boost an existing IG post" UI — hidden when in YT mode */}
          {!ytMode && (
            <>
              {!mediaList ? (
                <div className="ix-card p-5 text-sm">Select an account.</div>
              ) : !mediaList.ok ? (
                <div className="ix-card border-rose-200 bg-rose-50 dark:bg-rose-950 p-3 text-sm font-mono">
                  Failed to load IG media: {mediaList.error}
                </div>
              ) : mediaList.media.length === 0 ? (
                <div className="ix-card p-5 text-sm text-slate-500">
                  No posts found on this account yet.
                </div>
              ) : (
                /* Client component — handles selection + form entirely in-browser */
                <BoostSelector media={mediaList.media} account={selectedAccount!} />
              )}

              {/* Embedded YouTube picker — "Or pick a YouTube video" alternative source */}
              {pickerItems.length > 0 && (
                <section className="ix-card p-5 space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Or pick a YouTube video to create a fresh video ad
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Skip boosting an existing IG post — upload a YouTube video as a brand-new
                      Meta video ad creative instead.
                    </p>
                  </div>
                  <EmbeddedPicker
                    items={pickerItems}
                    platform="meta_video_ad"
                    publishPagePath="/beithady/ads/instagram/boost"
                  />
                </section>
              )}
            </>
          )}
        </>
      )}
    </BeithadyShell>
  );
}
