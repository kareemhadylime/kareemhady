'use client';
import { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { useGallery, type UploadJobCategory } from './gallery-provider';

export type UploaderUnit = { listing_id: string; nickname: string; total?: number };

export function Uploader({
  building,
  listingId,
  category,
  units,
}: {
  building?: string | null;
  listingId?: string | null;
  category?: UploadJobCategory;
  units?: UploaderUnit[];
}) {
  const { enqueueUpload, jobs } = useGallery();
  const [dragOver, setDragOver] = useState(false);
  const [target, setTarget] = useState<string>(listingId || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const showsUnitPicker = !!units && units.length > 0 && !listingId;
  const effectiveListingId = listingId || (target || null);

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    enqueueUpload(files, {
      building: building || null,
      listingId: effectiveListingId,
      category,
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  // Lightweight inline status — the floating UploadTray is the source of truth.
  const myActive = jobs.filter(j =>
    (j.status === 'queued' || j.status === 'uploading')
    && (j.building || null) === (building || null)
    && (j.listingId || null) === effectiveListingId
  ).length;

  return (
    <div className="space-y-3">
      {showsUnitPicker && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upload to:</span>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="ix-input flex-1 max-w-md"
          >
            <option value="">📍 General Building Area (lobby, pool, exterior, building-wide)</option>
            {units!.map(u => (
              <option key={u.listing_id} value={u.listing_id}>
                🛏️ {u.nickname}{typeof u.total === 'number' ? ` · ${u.total} item${u.total === 1 ? '' : 's'}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`ix-card border-2 border-dashed cursor-pointer p-8 text-center transition ${
          dragOver
            ? 'border-slate-700 bg-slate-50 dark:bg-slate-800/60'
            : 'border-slate-300 dark:border-slate-700 hover:border-slate-500 hover:bg-stone-50 dark:hover:bg-slate-800/30'
        }`}
      >
        <UploadCloud size={28} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Drag photos / videos here or click to browse
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {showsUnitPicker
            ? (target
                ? <>Files will land in <strong>{units!.find(u => u.listing_id === target)?.nickname || target}</strong></>
                : <>Files will land in <strong>General Building Area</strong></>)
            : (effectiveListingId
                ? 'Files attach to this unit'
                : building
                  ? `Files land at ${building} general area`
                  : 'Files land at Beithady library root')}
          {' · '}
          JPG/PNG/WEBP/HEIC + MP4/WEBM · large videos auto-compressed · AI labels in ~2 min
          {myActive > 0 && <> · <strong>{myActive} in progress</strong> (see tray ↘)</>}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={
            category === 'document'
              ? '.pdf,.doc,.docx,.xls,.xlsx,image/*'
              : 'image/*,video/mp4,video/webm,video/quicktime'
          }
          onChange={e => {
            handleFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
