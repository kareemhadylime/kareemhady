// src/app/beithady/gallery/youtube/_components/video-source-picker.tsx
'use client';

export type GalleryAssetOption = {
  id: string;
  file_name: string;
  signed_url: string;
  size_bytes: number;
  duration_sec: number | null;
  building_code: string | null;
};

export function VideoSourcePicker({
  galleryOptions,
  selectedId,
  onSelect,
}: {
  galleryOptions: GalleryAssetOption[];
  selectedId: string | null;
  onSelect: (asset: GalleryAssetOption) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-[11px] text-slate-500">
        Choose from videos already in Gallery. To upload a new file, drop it in Gallery first, then come back.
      </p>
      <select
        className="ix-input"
        value={selectedId ?? ''}
        onChange={(e) => {
          const a = galleryOptions.find(x => x.id === e.target.value);
          if (a) onSelect(a);
        }}
      >
        <option value="" disabled>Choose a Gallery video…</option>
        {galleryOptions.map(o => (
          <option key={o.id} value={o.id}>
            {o.building_code ? `${o.building_code} / ` : ''}{o.file_name} ({Math.round(o.size_bytes / 1024 / 1024)} MB)
          </option>
        ))}
      </select>
    </div>
  );
}
