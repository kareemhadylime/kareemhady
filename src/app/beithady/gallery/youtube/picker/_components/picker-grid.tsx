import type { PickerItem } from '@/lib/beithady/youtube/picker';
import { PickerRow } from './picker-row';

export function PickerGrid({ items }: { items: PickerItem[] }) {
  if (items.length === 0) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500">
        No YouTube videos match these filters.{' '}
        <a href="/beithady/gallery/youtube" className="ix-link">Upload your first one →</a>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      {items.map(it => <PickerRow key={it.youtube_video_id} item={it} />)}
    </div>
  );
}
