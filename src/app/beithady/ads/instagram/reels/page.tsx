import Link from 'next/link';
import { Camera, RefreshCw } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishInstagramReelAction, pollInstagramPostAction } from '../../actions';
import { statusBadgeClass } from '@/lib/beithady/ads/platforms';
import { fmtCairoDate } from '@/lib/fmt-date';
import { listPickerVideos } from '@/lib/beithady/youtube/picker';
import { EmbeddedPicker } from '@/app/beithady/gallery/youtube/picker/_components/embedded-picker';
import { YouTubeSourceBanner } from '@/app/beithady/gallery/youtube/picker/_components/youtube-source-banner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function InstagramReelsPage({ searchParams }: { searchParams: Promise<{ error?: string; post?: string; status?: string; yt_video_id?: string; ads_yt_video_id?: string; source?: string }> }) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: accountsRaw }, { data: postsRaw }] = await Promise.all([
    sb.from('ads_accounts').select('id, name, fb_page_id, fb_page_name, ig_business_id, ig_username').eq('platform', 'meta').order('id'),
    sb.from('ads_instagram_posts').select('id, video_url, caption, status, permalink, fb_status, fb_permalink, building_code, created_at, published_at').order('created_at', { ascending: false }).limit(25),
  ]);
  const accounts = (accountsRaw as Array<{ id: number; name: string; fb_page_id: string | null; fb_page_name: string | null; ig_business_id: string | null; ig_username: string | null }> | null) || [];
  const ready = accounts.filter(a => !!a.ig_business_id);
  const posts = (postsRaw as Array<{ id: number; video_url: string; caption: string | null; status: string; permalink: string | null; fb_status: string | null; fb_permalink: string | null; building_code: string | null; created_at: string; published_at: string | null }> | null) || [];

  // V1.2 cross-post: optional YouTube source pre-fill via ?yt_video_id=…
  const ytVideoIdParam = sp.yt_video_id ?? null;
  const adsYtVideoIdParam = sp.ads_yt_video_id ? Number(sp.ads_yt_video_id) : null;

  let ytSource: null | {
    yt_video_id: string;
    title: string;
    description: string | null;
    tags: string[] | null;
    duration_seconds: number | null;
    is_shorts: boolean;
    view_count: number;
    building_code: string | null;
    source_url: string | null;
  } = null;

  if (ytVideoIdParam) {
    const { data: ytRow } = await sb.from('ads_youtube_videos')
      .select('id, youtube_video_id, title, description, tags, duration_seconds, is_shorts, view_count, building_code, source_url')
      .eq('youtube_video_id', ytVideoIdParam).maybeSingle();
    if (ytRow) {
      const r = ytRow as Record<string, unknown>;
      ytSource = {
        yt_video_id: String(r.youtube_video_id),
        title: String(r.title),
        description: (r.description as string | null) ?? null,
        tags: (r.tags as string[] | null) ?? null,
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
        description: null,
        tags: null,
        duration_seconds: null,
        is_shorts: false,
        view_count: 0,
        building_code: null,
        source_url: null,
      };
    }
  }

  // Load YouTube picker items for the embedded source picker
  const { data: ytAccount } = await sb.from('ads_accounts')
    .select('id').eq('platform', 'youtube').limit(1).maybeSingle();
  const pickerItems = ytAccount
    ? await listPickerVideos((ytAccount as { id: number }).id).catch(() => [])
    : [];

  // Build pre-fill values
  const defaultCaption = ytSource
    ? [ytSource.title, (ytSource.description ?? '').slice(0, 200)].filter(Boolean).join('\n\n')
    : '';
  const defaultHashtags = ytSource?.tags ? ytSource.tags.join(', ') : '';
  const defaultBuildingCode = ytSource?.building_code ?? '';
  const defaultVideoUrl = ytSource?.source_url ?? '';

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Instagram Reels' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — Instagram Reel"
        subtitle="Push a Reel via the Instagram Graph API. Optionally cross-post to the linked Facebook Page as an FB Reel."
      />

      <AdsTabs active="reels" />

      {ytSource && (
        <YouTubeSourceBanner
          ytVideoId={ytSource.yt_video_id}
          title={ytSource.title}
          durationSeconds={ytSource.duration_seconds}
          isShorts={ytSource.is_shorts}
          viewCount={ytSource.view_count}
          publishPagePath="/beithady/ads/instagram/reels"
        />
      )}

      {sp.error && <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono">{sp.error}</div>}
      {sp.post && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          Submitted post <code>#{sp.post}</code> — status: <strong>{sp.status}</strong>.
        </div>
      )}

      {/* YouTube source picker (V1.2 cross-post) */}
      {pickerItems.length > 0 && !ytSource && (
        <section className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Or pick from YouTube</h2>
          <EmbeddedPicker
            items={pickerItems}
            platform="instagram_reel"
            publishPagePath="/beithady/ads/instagram/reels"
          />
        </section>
      )}

      {ready.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No Instagram Business account resolved yet. Go to <Link className="ix-link" href="/beithady/ads/accounts">Accounts</Link> and click <strong>Resolve IG</strong> on a Meta row with a linked FB Page.</p>
        </div>
      ) : (
        <form action={publishInstagramReelAction} className="ix-card p-5 space-y-4">
          <input type="hidden" name="yt_video_id" value={ytVideoIdParam ?? ''} />
          <input type="hidden" name="ads_yt_video_id" value={adsYtVideoIdParam ?? ''} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <label htmlFor="account_id" className="text-xs font-semibold">Account</label>
              <select id="account_id" name="account_id" required className="ix-input">
                {ready.map(a => <option key={a.id} value={a.id}>{a.ig_username ? `@${a.ig_username}` : a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Options</label>
              <div className="flex items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="share_to_feed" value="1" defaultChecked /> Share to feed</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="also_to_facebook" value="1" /> Cross-post to FB</label>
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="video_url" className="text-xs font-semibold">Video URL (public HTTPS)</label>
              <input id="video_url" name="video_url" required className="ix-input font-mono text-xs" defaultValue={defaultVideoUrl} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="caption" className="text-xs font-semibold">Caption</label>
              <textarea id="caption" name="caption" rows={3} className="ix-input" defaultValue={defaultCaption} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="hashtags" className="text-xs font-semibold">Hashtags (comma or newline separated, no # needed)</label>
              <input id="hashtags" name="hashtags" className="ix-input" placeholder="BeitHady, Cairo, luxurystay" defaultValue={defaultHashtags} />
            </div>
            <div className="space-y-1">
              <label htmlFor="building_code" className="text-xs font-semibold">Building code</label>
              <input id="building_code" name="building_code" className="ix-input font-mono text-xs" placeholder="BH-435" defaultValue={defaultBuildingCode} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="ix-btn-primary"><Camera size={14} /> Publish Reel</button>
          </div>
        </form>
      )}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Recent posts</h2>
        {posts.length === 0 ? (
          <p className="text-xs text-slate-500">No Instagram posts yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Building</th>
                <th className="py-2 pr-3">Caption</th>
                <th className="py-2 pr-3">IG status</th>
                <th className="py-2 pr-3">IG</th>
                <th className="py-2 pr-3">FB</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                  <td className="py-2 pr-3">{fmtCairoDate(p.created_at)}</td>
                  <td className="py-2 pr-3 font-mono">{p.building_code || '—'}</td>
                  <td className="py-2 pr-3 max-w-xs truncate">{p.caption || '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(p.status)}`}>{p.status}</span>
                  </td>
                  <td className="py-2 pr-3">{p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="ix-link">open</a> : '—'}</td>
                  <td className="py-2 pr-3">
                    {p.fb_status
                      ? <>
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(p.fb_status)}`}>{p.fb_status}</span>
                        {p.fb_permalink && <> <a href={p.fb_permalink} target="_blank" rel="noreferrer" className="ix-link ml-1">open</a></>}
                      </>
                      : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {!['PUBLISHED', 'ERROR'].includes(p.status) && (
                      <form action={pollInstagramPostAction} className="inline">
                        <input type="hidden" name="post_id" value={p.id} />
                        <button className="ix-link text-[11px] inline-flex items-center gap-1"><RefreshCw size={10} /> Re-check</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </BeithadyShell>
  );
}
