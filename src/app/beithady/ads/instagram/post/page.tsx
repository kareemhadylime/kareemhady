import Link from 'next/link';
import { Image as ImageIcon, RefreshCw, AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { publishInstagramPostAction, pollInstagramPostAction } from '../../actions';
import { statusBadgeClass } from '@/lib/beithady/ads/platforms';
import { fmtCairoDate } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SP = {
  error?: string;
  post?: string;
  status?: string;
  type?: 'image' | 'carousel' | 'video';
};

export default async function InstagramPostPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const activeType: 'image' | 'carousel' | 'video' = sp.type || 'image';
  const sb = supabaseAdmin();

  const [{ data: accountsRaw }, { data: postsRaw }] = await Promise.all([
    sb.from('ads_accounts').select('id, name, fb_page_id, fb_page_name, ig_business_id, ig_username').eq('platform', 'meta').order('id'),
    sb.from('ads_instagram_posts').select('id, post_type, image_url, video_url, child_urls, caption, status, permalink, thumbnail_url, fb_status, fb_permalink, building_code, created_at, published_at').neq('post_type', 'reel').order('created_at', { ascending: false }).limit(25),
  ]);
  const accounts = (accountsRaw as Array<{ id: number; name: string; fb_page_id: string | null; fb_page_name: string | null; ig_business_id: string | null; ig_username: string | null }> | null) || [];
  const ready = accounts.filter(a => !!a.ig_business_id);
  const posts = (postsRaw as Array<{ id: number; post_type: string; image_url: string | null; video_url: string | null; child_urls: string[] | null; caption: string | null; status: string; permalink: string | null; thumbnail_url: string | null; fb_status: string | null; fb_permalink: string | null; building_code: string | null; created_at: string; published_at: string | null }> | null) || [];

  const typeTabs: Array<{ slug: 'image'|'carousel'|'video'; label: string }> = [
    { slug: 'image', label: 'Single Image' },
    { slug: 'carousel', label: 'Carousel (2–10)' },
    { slug: 'video', label: 'Feed Video' },
  ];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Instagram Post' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Publish — Instagram Feed Post"
        subtitle="Single image, carousel (2–10), or feed video. Optionally cross-post to the linked Facebook Page."
      />

      <AdsTabs active="ig-post" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-rose-600 shrink-0" />
            <strong className="text-rose-700 dark:text-rose-300">Publish failed</strong>
          </div>
          <pre className="font-mono text-xs text-rose-800 dark:text-rose-200 whitespace-pre-wrap break-all">{sp.error}</pre>
        </div>
      )}
      {sp.post && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          Submitted post <code>#{sp.post}</code> — status: <strong>{sp.status}</strong>.
        </div>
      )}

      {ready.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No Instagram Business account resolved yet. Go to <Link className="ix-link" href="/beithady/ads/accounts">Accounts</Link> and click <strong>Resolve IG</strong> on a Meta row.</p>
        </div>
      ) : (
        <>
          {/* Type picker */}
          <div className="flex gap-1.5">
            {typeTabs.map(t => (
              <Link
                key={t.slug}
                href={`?type=${t.slug}`}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition border ${
                  activeType === t.slug
                    ? 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-700'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          <form action={publishInstagramPostAction} className="ix-card p-5 space-y-4">
            <input type="hidden" name="post_type" value={activeType} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <label htmlFor="account_id" className="text-xs font-semibold">Account</label>
                <select id="account_id" name="account_id" required className="ix-input">
                  {ready.map(a => <option key={a.id} value={a.id}>{a.ig_username ? `@${a.ig_username}` : a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Cross-post</label>
                <div className="flex items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" name="also_to_facebook" value="1" /> Also publish to FB Page
                  </label>
                </div>
              </div>

              {activeType === 'image' && (
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor="image_url" className="text-xs font-semibold">Image URL (public HTTPS, ≥320×320, JPEG)</label>
                  <input id="image_url" name="image_url" required className="ix-input font-mono text-xs" />
                </div>
              )}
              {activeType === 'video' && (
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor="video_url" className="text-xs font-semibold">Video URL (public HTTPS, MP4/MOV ≤100 MB)</label>
                  <input id="video_url" name="video_url" required className="ix-input font-mono text-xs" />
                </div>
              )}
              {activeType === 'carousel' && (
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor="child_urls" className="text-xs font-semibold">Carousel image URLs — one per line (2–10 images)</label>
                  <textarea id="child_urls" name="child_urls" required rows={5} className="ix-input font-mono text-xs" placeholder="https://...jpg&#10;https://...jpg&#10;https://...jpg" />
                </div>
              )}

              <div className="space-y-1 md:col-span-2">
                <label htmlFor="caption" className="text-xs font-semibold">Caption (≤2 200 chars, IG)</label>
                <textarea id="caption" name="caption" rows={3} className="ix-input" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label htmlFor="hashtags" className="text-xs font-semibold">Hashtags (comma or newline, no # needed)</label>
                <input id="hashtags" name="hashtags" className="ix-input" placeholder="BeitHady, Cairo, serviced apartments" />
              </div>
              <div className="space-y-1">
                <label htmlFor="building_code" className="text-xs font-semibold">Building code</label>
                <input id="building_code" name="building_code" className="ix-input font-mono text-xs" placeholder="BH-435" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label htmlFor="fb_caption" className="text-xs font-semibold">FB-specific caption (optional — defaults to IG caption)</label>
                <input id="fb_caption" name="fb_caption" className="ix-input text-xs" />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="ix-btn-primary"><ImageIcon size={14} /> Publish</button>
            </div>
          </form>
        </>
      )}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Recent posts</h2>
        {posts.length === 0 ? (
          <p className="text-xs text-slate-500">No feed posts yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Building</th>
                <th className="py-2 pr-3">Caption</th>
                <th className="py-2 pr-3">IG</th>
                <th className="py-2 pr-3">FB</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                  <td className="py-2 pr-3">{fmtCairoDate(p.created_at)}</td>
                  <td className="py-2 pr-3 uppercase font-mono text-[10px]">{p.post_type}</td>
                  <td className="py-2 pr-3 font-mono">{p.building_code || '—'}</td>
                  <td className="py-2 pr-3 max-w-xs truncate">{p.caption || '—'}</td>
                  <td className="py-2 pr-3">
                    {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="ix-link">open</a> : (
                      <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(p.status)}`}>{p.status}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {p.fb_permalink ? <a href={p.fb_permalink} target="_blank" rel="noreferrer" className="ix-link">open</a>
                      : (p.fb_status ? <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(p.fb_status)}`}>{p.fb_status}</span> : '—')}
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
