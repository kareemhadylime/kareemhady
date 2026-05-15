// src/app/beithady/ads/tiktok/organic/page.tsx
//
// Curated social reels — TikTok + Instagram public URLs embedded inside
// the /beithady dashboard via each platform's official embed.js. No
// platform API access required. URL kept as /ads/tiktok/organic for
// backward compat with AdsTabs + bookmarks; the page itself now serves
// both platforms.
import Script from 'next/script';
import { Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listMarketingReels, type MarketingReelPlatform } from '@/lib/beithady/marketing-reels';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { AddReelForm } from './_components/add-reel-form';
import { ReelCard } from './_components/reel-card';
import {
  addReelAction,
  updateReelAction,
  toggleReelVisibilityAction,
  deleteReelAction,
} from './actions';

const PLATFORM_FILTERS: Array<{ id: MarketingReelPlatform | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
];

export const dynamic = 'force-dynamic';

export default async function TikTokOrganicReelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    added?: string;
    updated?: string;
    deleted?: string;
    building?: string;
    show_hidden?: string;
    platform?: string;
  }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const showHidden = sp.show_hidden === '1';
  const platformFilter: MarketingReelPlatform | undefined =
    sp.platform === 'tiktok' || sp.platform === 'instagram' ? sp.platform : undefined;
  const reels = await listMarketingReels({
    platform: platformFilter,
    visibleOnly: !showHidden,
    building: sp.building || null,
  });
  const activeFilterId = platformFilter ?? 'all';

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Ads', href: '/beithady/ads' },
        { label: 'Reels' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Ads · Reels"
        title="Curated Reels"
        subtitle="TikTok + Instagram public URLs, embedded in the dashboard. TikTok captions, thumbnails, and author are auto-fetched via oEmbed; Instagram embeds carry their own caption."
      />

      <AdsTabs active="tt-organic" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm">
          ⚠️ {sp.error}
        </div>
      )}
      {sp.added && (
        <div className="ix-card border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3 text-sm">
          ✅ Reel added (#{sp.added}).
        </div>
      )}
      {sp.updated && (
        <div className="ix-card border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 text-sm">
          ✏️ Reel #{sp.updated} updated.
        </div>
      )}
      {sp.deleted && (
        <div className="ix-card border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-sm">
          🗑️ Reel #{sp.deleted} deleted.
        </div>
      )}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles size={14} className="text-rose-600" />
          Add a reel
        </h2>
        <AddReelForm action={addReelAction} />
        <p className="text-xs text-slate-500">
          Paste the full URL from your browser. Examples:{' '}
          <code className="font-mono">https://www.tiktok.com/@beithady/video/72...</code> or{' '}
          <code className="font-mono">https://www.instagram.com/reel/Cxyz.../</code>. Short links
          (<code className="font-mono">vm.tiktok.com</code>, <code className="font-mono">vt.tiktok.com</code>)
          aren&apos;t supported — open them in a browser and copy the long URL.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 flex-wrap">
          <span>
            {reels.length} reel{reels.length === 1 ? '' : 's'}
            {platformFilter ? ` (${platformFilter})` : ''}
            {sp.building ? ` for ${sp.building}` : ''}
            {showHidden ? ' (incl. hidden)' : ''}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 p-0.5">
              {PLATFORM_FILTERS.map((f) => {
                const isActive = activeFilterId === f.id;
                const params = new URLSearchParams();
                if (f.id !== 'all') params.set('platform', f.id);
                if (showHidden) params.set('show_hidden', '1');
                if (sp.building) params.set('building', sp.building);
                const href = `/beithady/ads/tiktok/organic${params.size ? `?${params.toString()}` : ''}`;
                return (
                  <a
                    key={f.id}
                    href={href}
                    className={`px-2 py-0.5 rounded text-[11px] transition ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {f.label}
                  </a>
                );
              })}
            </div>
            <a
              href={(() => {
                const params = new URLSearchParams();
                if (!showHidden) params.set('show_hidden', '1');
                if (platformFilter) params.set('platform', platformFilter);
                if (sp.building) params.set('building', sp.building);
                return `/beithady/ads/tiktok/organic${params.size ? `?${params.toString()}` : ''}`;
              })()}
              className="ix-link"
            >
              {showHidden ? 'Hide hidden' : 'Show hidden'}
            </a>
          </div>
        </div>

        {reels.length === 0 ? (
          <div className="ix-card p-10 text-center text-sm text-slate-500">
            No reels yet. Paste a TikTok or Instagram URL above to add the first one.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {reels.map((reel) => (
              <ReelCard
                key={reel.id}
                reel={reel}
                actions={{
                  update: updateReelAction,
                  toggle: toggleReelVisibilityAction,
                  remove: deleteReelAction,
                }}
              />
            ))}
          </div>
        )}
      </section>

      <Script src="https://www.tiktok.com/embed.js" strategy="lazyOnload" />
      <Script src="https://www.instagram.com/embed.js" strategy="lazyOnload" />
    </BeithadyShell>
  );
}
