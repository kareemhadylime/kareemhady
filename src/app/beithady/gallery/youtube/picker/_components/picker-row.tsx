// src/app/beithady/gallery/youtube/picker/_components/picker-row.tsx
'use client';
import Link from 'next/link';
import { fmtCairoDate } from '@/lib/fmt-date';
import type { PickerItem } from '@/lib/beithady/youtube/picker';
import type { TargetPlatform } from '@/lib/beithady/youtube/picker-errors';

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const PLATFORM_LABEL: Record<TargetPlatform, string> = {
  instagram_reel: 'Post as IG Reel',
  tiktok_organic: 'Post to TikTok',
  tiktok_paid: 'TikTok Ad',
  meta_video_ad: 'Meta Ad',
  google_pmax: 'Google PMax',
};

const PLATFORM_HREF: Record<TargetPlatform, string> = {
  instagram_reel: '/beithady/ads/instagram/reels',
  tiktok_organic: '/beithady/ads/tiktok/organic',
  tiktok_paid: '/beithady/ads/tiktok/paid',
  meta_video_ad: '/beithady/ads/instagram/boost',
  google_pmax: '/beithady/ads/google/pmax',
};

function actionHref(platform: TargetPlatform, ytVideoId: string, adsYtVideoId: number | null): string {
  const params = new URLSearchParams();
  params.set('yt_video_id', ytVideoId);
  params.set('source', 'youtube');
  if (adsYtVideoId != null) params.set('ads_yt_video_id', String(adsYtVideoId));
  return `${PLATFORM_HREF[platform]}?${params.toString()}`;
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export function PickerRow({ item }: { item: PickerItem }) {
  return (
    <div className="ix-card p-4 flex gap-4">
      <div className="w-32 h-20 flex-shrink-0 rounded overflow-hidden bg-slate-200 dark:bg-slate-700">
        {item.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{item.title}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          <code className="text-[10px]">{item.youtube_video_id}</code>
          {' · '}{fmtDuration(item.duration_seconds)}
          {' · '}{item.is_shorts ? 'Shorts' : 'Long-form'}
          {item.building_code && <> · {item.building_code}</>}
          {' · '}{item.privacy_status}
          {' · '}{item.in_local_db ? 'in app' : 'YouTube-only'}
        </div>
        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
          Views {item.view_count ? fmt.format(item.view_count) : '—'}
          {' · '}Likes {item.like_count ? fmt.format(item.like_count) : '—'}
          {item.published_at && <> · {fmtCairoDate(item.published_at)}</>}
        </div>

        <AlreadyPostedLine xposts={item.already_cross_posted} />

        <div className="flex flex-wrap gap-1.5 mt-2">
          {(['instagram_reel', 'tiktok_organic', 'tiktok_paid', 'meta_video_ad', 'google_pmax'] as TargetPlatform[]).map(p => (
            <ActionButton
              key={p}
              platform={p}
              available={item.actions[p].available}
              reason={item.actions[p].reason}
              href={actionHref(p, item.youtube_video_id, item.ads_youtube_video_id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AlreadyPostedLine({ xposts }: { xposts: PickerItem['already_cross_posted'] }) {
  const platforms: TargetPlatform[] = ['instagram_reel', 'tiktok_organic', 'tiktok_paid', 'meta_video_ad', 'google_pmax'];
  const labels: Record<TargetPlatform, string> = {
    instagram_reel: 'IG',
    tiktok_organic: 'TT',
    tiktok_paid: 'TT Ad',
    meta_video_ad: 'Meta Ad',
    google_pmax: 'PMax',
  };
  const parts: string[] = [];
  let anyPosted = false;
  for (const p of platforms) {
    const x = xposts[p];
    if (x.count > 0) {
      anyPosted = true;
      parts.push(`✓ ${labels[p]} (${x.count})`);
    }
  }
  if (!anyPosted) {
    return <div className="text-[11px] text-slate-400 mt-0.5">Not cross-posted yet</div>;
  }
  return <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">Already posted: {parts.join(' · ')}</div>;
}

function ActionButton({ platform, available, reason, href }: {
  platform: TargetPlatform;
  available: boolean;
  reason?: string;
  href: string;
}) {
  if (available) {
    return (
      <Link href={href} className="ix-btn-secondary text-[11px]">
        {PLATFORM_LABEL[platform]}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled
      title={reason ?? 'Unavailable'}
      className="ix-btn-secondary text-[11px] opacity-40 cursor-not-allowed"
    >
      ⊗ {PLATFORM_LABEL[platform]}
    </button>
  );
}
