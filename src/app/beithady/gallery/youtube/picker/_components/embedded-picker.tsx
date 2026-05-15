import type { PickerItem } from '@/lib/beithady/youtube/picker';
import type { TargetPlatform } from '@/lib/beithady/youtube/picker-errors';
import Link from 'next/link';

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function EmbeddedPicker({
  items,
  platform,
  publishPagePath,
}: {
  items: PickerItem[];
  platform: TargetPlatform;
  publishPagePath: string;
}) {
  const compatible = items.filter(i => i.actions[platform].available);

  if (compatible.length === 0) {
    return (
      <div className="text-xs text-slate-500 py-4">
        No YouTube videos compatible with {platform.replace('_', ' ')} yet.{' '}
        <Link href="/beithady/gallery/youtube" className="ix-link">Upload one →</Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
      {compatible.map(item => {
        const params = new URLSearchParams();
        params.set('yt_video_id', item.youtube_video_id);
        params.set('source', 'youtube');
        if (item.ads_youtube_video_id != null) params.set('ads_yt_video_id', String(item.ads_youtube_video_id));
        return (
          <Link
            key={item.youtube_video_id}
            href={`${publishPagePath}?${params.toString()}`}
            className="ix-card p-2 flex gap-2 items-center hover:shadow-sm transition"
          >
            <div className="w-16 h-10 rounded overflow-hidden bg-slate-200 flex-shrink-0">
              {item.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{item.title}</div>
              <div className="text-[10px] text-slate-500">
                {item.duration_seconds ? `${item.duration_seconds}s` : '—'}
                {' · '}{item.is_shorts ? 'Shorts' : 'Long-form'}
                {' · '}Views {item.view_count ? fmt.format(item.view_count) : '—'}
              </div>
            </div>
            <span className="text-[11px] text-emerald-600">Use this →</span>
          </Link>
        );
      })}
    </div>
  );
}
