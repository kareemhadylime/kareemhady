import Link from 'next/link';
import { Music2, RefreshCw, Copy, Info } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishTikTokReelAction, pollTikTokPostAction } from '../../actions';
import { statusBadgeClass } from '@/lib/beithady/ads/platforms';
import { fmtCairoDate } from '@/lib/fmt-date';
import { listIgPickerItems, buildTikTokDefaultsFromPickerItem, type IgReelDefaults } from '@/lib/beithady/ads/ig-to-tiktok';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function TikTokOrganicPage({ searchParams }: { searchParams: Promise<{ error?: string; post?: string; status?: string; from_ig?: string }> }) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: accountsRaw }, { data: postsRaw }, igPickerItems] = await Promise.all([
    sb.from('ads_accounts').select('id, name, tiktok_username, tiktok_refresh_token').eq('platform', 'tiktok').order('id'),
    sb.from('ads_tiktok_posts').select('id, video_url, caption, status, share_url, building_code, created_at, published_at').order('created_at', { ascending: false }).limit(25),
    listIgPickerItems(30),
  ]);
  const accounts = (accountsRaw as Array<{ id: number; name: string; tiktok_username: string | null; tiktok_refresh_token: string | null }> | null) || [];
  const connected = accounts.filter(a => !!a.tiktok_refresh_token);
  const posts = (postsRaw as Array<{ id: number; video_url: string; caption: string | null; status: string; share_url: string | null; building_code: string | null; created_at: string; published_at: string | null }> | null) || [];

  // Pre-fill from a selected IG Reel or Story — mirrors the video to Supabase so TikTok can fetch it.
  let prefill: IgReelDefaults | null = null;
  let prefillKind: 'reel' | 'story' | null = null;
  const fromIgId = sp.from_ig || null;
  if (fromIgId) {
    const item = igPickerItems.find(m => m.id === fromIgId);
    if (item) {
      prefill = await buildTikTokDefaultsFromPickerItem(item);
      prefillKind = item.kind;
    }
  }

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'TikTok Reels' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — TikTok Reels (organic)"
        subtitle="Push a video to TikTok via the Content Posting API. Default flow lands the video in the user's TikTok inbox; finalize from the TikTok app."
      />

      <AdsTabs active="tt-organic" />

      {sp.error && <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono whitespace-pre-wrap break-all">{sp.error}</div>}
      {sp.post && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          Submitted post <code>#{sp.post}</code> — status: <strong>{sp.status}</strong>. Inbox posts finish via TikTok app.
        </div>
      )}

      {/* IG Reels + Stories picker — click any thumbnail to mirror it to Supabase and pre-fill the form */}
      {igPickerItems.length > 0 && (
        <div className="ix-card p-3">
          <p className="text-xs font-semibold mb-2 text-slate-500 dark:text-slate-400">
            Source from Instagram — <span className="text-violet-600 dark:text-violet-400">Reels</span> + currently-live <span className="text-rose-600 dark:text-rose-400">Stories</span> (click to mirror video + pre-fill)
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {igPickerItems.map(item => {
              const thumb = item.thumbnail_url || item.media_url;
              const selected = fromIgId === item.id;
              const isStory = item.kind === 'story';
              return (
                <a
                  key={item.id}
                  href={`?from_ig=${item.id}`}
                  title={isStory ? 'IG Story (live, 24h)' : (item.caption?.slice(0, 80) || 'IG Reel')}
                  className={`relative shrink-0 rounded overflow-hidden border-2 transition-colors ${
                    selected
                      ? (isStory ? 'border-rose-500 ring-2 ring-rose-300 dark:ring-rose-700' : 'border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700')
                      : 'border-transparent hover:border-slate-400'
                  }`}
                >
                  {thumb
                    ? <img src={thumb} alt="" className="w-16 h-24 object-cover" />
                    : <div className="w-16 h-24 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-500">no img</div>
                  }
                  {isStory && (
                    <span className="absolute top-0.5 left-0.5 text-[9px] font-semibold bg-rose-500 text-white px-1 rounded">STORY</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {prefill?.found && (
        <div className={`ix-card p-4 text-sm space-y-2 ${prefillKind === 'story' ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950' : 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950'}`}>
          <div className="flex items-center gap-2">
            <Copy size={14} className={`shrink-0 ${prefillKind === 'story' ? 'text-rose-600 dark:text-rose-300' : 'text-violet-600 dark:text-violet-300'}`} />
            <strong>Sourced from Instagram {prefillKind === 'story' ? 'Story' : 'Reel'}</strong>
            {prefill.permalink && <a href={prefill.permalink} target="_blank" rel="noreferrer" className="ix-link text-xs">view on IG →</a>}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Video mirrored to Supabase public storage so TikTok can fetch it server-side. Review caption + hashtags before publishing.
          </div>
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

      {connected.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No TikTok account connected. Connect via OAuth on the accounts page first.</p>
          <Link className="ix-link" href="/beithady/ads/tiktok/accounts">Configure TikTok accounts →</Link>
        </div>
      ) : (
        <form action={publishTikTokReelAction} className="ix-card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <label htmlFor="account_id" className="text-xs font-semibold">Account</label>
              <select id="account_id" name="account_id" required className="ix-input">
                {connected.map(a => <option key={a.id} value={a.id}>{a.tiktok_username ? `@${a.tiktok_username}` : a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="privacy_level" className="text-xs font-semibold">Privacy</label>
              <select id="privacy_level" name="privacy_level" className="ix-input">
                <option value="PUBLIC_TO_EVERYONE">Public</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                <option value="FOLLOWER_OF_CREATOR">Followers</option>
                <option value="SELF_ONLY">Private</option>
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="video_url" className="text-xs font-semibold">Video URL (public HTTPS)</label>
              <input id="video_url" name="video_url" required className="ix-input font-mono text-xs" defaultValue={prefill?.videoUrl || ''} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="caption" className="text-xs font-semibold">Caption</label>
              <textarea id="caption" name="caption" rows={3} className="ix-input" defaultValue={prefill?.caption || ''} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="hashtags" className="text-xs font-semibold">Hashtags (comma or newline separated, no # needed)</label>
              <input id="hashtags" name="hashtags" className="ix-input" placeholder="BeitHady, Cairo, luxurystay" defaultValue={(prefill?.hashtags || []).join(', ')} />
            </div>
            <div className="space-y-1">
              <label htmlFor="building_code" className="text-xs font-semibold">Building code</label>
              <input id="building_code" name="building_code" className="ix-input font-mono text-xs" placeholder="BH-435" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Direct post?</label>
              <label className="text-xs inline-flex items-center gap-2">
                <input type="checkbox" name="direct_post" value="1" /> Bypass inbox (requires audited app)
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="ix-btn-primary"><Music2 size={14} /> Publish</button>
          </div>
        </form>
      )}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Recent posts</h2>
        {posts.length === 0 ? (
          <p className="text-xs text-slate-500">No TikTok posts yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Building</th>
                <th className="py-2 pr-3">Caption</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Link</th>
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
                  <td className="py-2 pr-3">{p.share_url ? <a href={p.share_url} target="_blank" rel="noreferrer" className="ix-link">open</a> : '—'}</td>
                  <td className="py-2 pr-3">
                    {!['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX'].includes(p.status) && (
                      <form action={pollTikTokPostAction} className="inline">
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
