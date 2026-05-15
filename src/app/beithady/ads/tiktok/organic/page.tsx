// src/app/beithady/ads/tiktok/organic/page.tsx
//
// TikTok Reels (organic): curated public TikTok URLs embedded inside the
// /beithady dashboard via TikTok's official embed.js. No TikTok API access
// required. Replaces the prior publish-out flow (blocked by TikTok
// dev-app rejection in May 2026, "personal/internal company use not
// supported"). Publish-out server code is retained in
// src/lib/beithady/ads/tiktok-organic-publish.ts in case a future
// re-application succeeds.
import Script from 'next/script';
import { Music2 } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listMarketingReels } from '@/lib/beithady/marketing-reels';
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
  }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const showHidden = sp.show_hidden === '1';
  const reels = await listMarketingReels({
    platform: 'tiktok',
    visibleOnly: !showHidden,
    building: sp.building || null,
  });

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Ads', href: '/beithady/ads' },
        { label: 'TikTok Reels' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Ads · TikTok"
        title="TikTok Reels"
        subtitle="Curated public TikTok content embedded in the dashboard. Paste a TikTok video URL to add it — no API access required."
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
          <Music2 size={14} className="text-rose-600" />
          Add a TikTok reel
        </h2>
        <AddReelForm action={addReelAction} />
        <p className="text-xs text-slate-500">
          Paste the full URL from the browser (e.g.{' '}
          <code className="font-mono">https://www.tiktok.com/@beithady/video/72...</code>). Short
          links (vm.tiktok.com / vt.tiktok.com) aren&apos;t supported — open them in a browser and
          copy the long URL.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {reels.length} reel{reels.length === 1 ? '' : 's'}
            {sp.building ? ` for ${sp.building}` : ''}
            {showHidden ? ' (incl. hidden)' : ''}
          </span>
          <a
            href={`/beithady/ads/tiktok/organic${showHidden ? '' : '?show_hidden=1'}`}
            className="ix-link"
          >
            {showHidden ? 'Hide hidden' : 'Show hidden'}
          </a>
        </div>

        {reels.length === 0 ? (
          <div className="ix-card p-10 text-center text-sm text-slate-500">
            No reels yet. Paste a TikTok URL above to add the first one.
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
    </BeithadyShell>
  );
}
