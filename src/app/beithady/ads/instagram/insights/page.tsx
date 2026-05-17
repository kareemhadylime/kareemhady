import Link from 'next/link';
import { BarChart3, RefreshCw, Eye, Heart, MessageCircle, Repeat2, Bookmark } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { refreshInsightsForPosts, type PostRow } from '@/lib/beithady/ads/ig-fb-insights';
import { fmtCairoDate } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SP = {
  range?: '7d' | '30d' | '90d' | 'all';
  refresh?: '1';
};

const RANGES: Array<{ slug: SP['range']; label: string; days: number | null }> = [
  { slug: '7d', label: '7 days', days: 7 },
  { slug: '30d', label: '30 days', days: 30 },
  { slug: '90d', label: '90 days', days: 90 },
  { slug: 'all', label: 'All time', days: null },
];

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const activeRange: SP['range'] = sp.range || '30d';
  const force = sp.refresh === '1';
  const rangeDef = RANGES.find(r => r.slug === activeRange) || RANGES[1];

  const sb = supabaseAdmin();
  let query = sb
    .from('ads_instagram_posts')
    .select('id, post_type, media_id, fb_page_post_id, caption, permalink, fb_permalink, thumbnail_url, building_code, published_at, ig_insights, ig_insights_fetched_at, fb_insights, fb_insights_fetched_at')
    .eq('status', 'PUBLISHED')
    .not('media_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50);
  if (rangeDef.days != null) {
    const fromIso = new Date(Date.now() - rangeDef.days * 24 * 3600 * 1000).toISOString();
    query = query.gte('published_at', fromIso);
  }
  const { data: rowsRaw } = await query;
  const rows = (rowsRaw as PostRow[] & Array<{ caption: string | null; permalink: string | null; fb_permalink: string | null; thumbnail_url: string | null; building_code: string | null; published_at: string | null }> | null) || [];

  const metricsMap = await refreshInsightsForPosts(rows, { force });

  // Aggregate totals for the range
  let totalIgViews = 0, totalIgLikes = 0, totalIgComments = 0, totalIgReach = 0;
  let totalFbViews = 0, totalFbLikes = 0;
  let igCount = 0, fbCount = 0;
  for (const r of rows) {
    const m = metricsMap.get(r.id);
    if (!m) continue;
    if (m.ig) {
      igCount++;
      totalIgViews += m.ig.views || 0;
      totalIgLikes += m.ig.likes || 0;
      totalIgComments += m.ig.comments || 0;
      totalIgReach += m.ig.reach || 0;
    }
    if (m.fb) {
      fbCount++;
      totalFbViews += m.fb.views || 0;
      totalFbLikes += m.fb.likes || 0;
    }
  }

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Insights' }]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Organic Insights — IG + FB"
        subtitle="Views, likes and engagement per post across Instagram and Facebook. Metrics cached 5 min — refresh to pull fresh."
      />

      <AdsTabs active="ig-insights" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">Range</span>
        {RANGES.map(r => (
          <Link
            key={r.slug}
            href={`?range=${r.slug}`}
            className={`px-2.5 py-1 rounded-md transition border ${
              activeRange === r.slug
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
            }`}
          >
            {r.label}
          </Link>
        ))}
        <Link
          href={`?range=${activeRange}&refresh=1`}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-400"
        >
          <RefreshCw size={12} /> Refresh now
        </Link>
      </div>

      {/* Aggregate cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Eye} label="IG views" value={fmtNum(totalIgViews)} sub={`${igCount} posts`} />
        <KpiCard icon={Heart} label="IG likes" value={fmtNum(totalIgLikes)} sub={`${fmtNum(totalIgComments)} comments`} />
        <KpiCard icon={Eye} label="FB views" value={fmtNum(totalFbViews)} sub={`${fbCount} cross-posts`} />
        <KpiCard icon={Heart} label="FB likes" value={fmtNum(totalFbLikes)} sub={`reach IG ${fmtNum(totalIgReach)}`} />
      </div>

      {/* Per-post table */}
      <section className="ix-card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-5 text-xs text-slate-500">No published posts in this range.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 px-3">When</th>
                <th className="py-2 px-3">Post</th>
                <th className="py-2 px-3 text-right" title="IG views (videos/reels)"><Eye size={11} className="inline" /> IG views</th>
                <th className="py-2 px-3 text-right" title="IG reach (all post types)">IG reach</th>
                <th className="py-2 px-3 text-right" title="IG likes"><Heart size={11} className="inline" /> IG likes</th>
                <th className="py-2 px-3 text-right" title="IG comments"><MessageCircle size={11} className="inline" /></th>
                <th className="py-2 px-3 text-right" title="IG shares"><Repeat2 size={11} className="inline" /></th>
                <th className="py-2 px-3 text-right" title="IG saved"><Bookmark size={11} className="inline" /></th>
                <th className="py-2 px-3 text-right" title="FB views (video)"><Eye size={11} className="inline" /> FB views</th>
                <th className="py-2 px-3 text-right" title="FB likes"><Heart size={11} className="inline" /> FB likes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const m = metricsMap.get(r.id);
                const ig = m?.ig;
                const fb = m?.fb;
                const r0 = r as PostRow & { caption: string | null; permalink: string | null; fb_permalink: string | null; thumbnail_url: string | null; building_code: string | null; published_at: string | null };
                return (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                    <td className="py-2 px-3 whitespace-nowrap">{r0.published_at ? fmtCairoDate(r0.published_at) : '—'}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {r0.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r0.thumbnail_url} alt="" className="w-10 h-10 object-cover rounded" />
                        )}
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase font-mono text-slate-400">{r.post_type}{r0.building_code ? ` · ${r0.building_code}` : ''}</div>
                          <div className="max-w-xs truncate">
                            {r0.permalink ? <a href={r0.permalink} target="_blank" rel="noreferrer" className="ix-link">{r0.caption?.slice(0, 60) || '—'}</a>
                              : (r0.caption?.slice(0, 60) || '—')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{fmtNum(ig?.views ?? null)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtNum(ig?.reach ?? null)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtNum(ig?.likes ?? null)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtNum(ig?.comments ?? null)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtNum(ig?.shares ?? null)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtNum(ig?.saved ?? null)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fb ? fmtNum(fb.views) : <span className="text-slate-300">—</span>}</td>
                    <td className="py-2 px-3 text-right font-mono">{fb ? fmtNum(fb.likes) : <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </BeithadyShell>
  );
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <div className="ix-card p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500"><Icon size={12} /> {label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
