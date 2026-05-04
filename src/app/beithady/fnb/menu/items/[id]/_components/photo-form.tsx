'use client';
import { useState } from 'react';
import type { Item } from '@/lib/beithady/fnb/types';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_BYTES = 5 * 1024 * 1024;

// New minimal preview endpoint added at src/app/api/beithady/fnb/photo/route.ts
// which accepts ?path=<storage_path> and 302-redirects to a 1-hour signed URL.
const PREVIEW_URL = (path: string) =>
  `/api/beithady/fnb/photo?path=${encodeURIComponent(path)}`;

export function PhotoForm({
  item, onSaved,
}: { item: Item; onSaved: (item: Item) => void }) {
  const [progress, setProgress] = useState<
    'idle' | 'signing' | 'uploading' | 'saving' | 'done'
  >('idle');
  const [err, setErr] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState(item.photo_path ?? null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(null);
    if (!ALLOWED.includes(file.type)) { setErr('Use JPG, PNG, WEBP, or HEIC.'); return; }
    if (file.size > MAX_BYTES) { setErr('Max 5 MB.'); return; }

    setProgress('signing');
    const sig = await fetch(
      `/api/beithady/fnb/items/${item.id}/photo-upload-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size_bytes: file.size }),
      },
    );
    if (!sig.ok) { setErr('Signed URL failed.'); setProgress('idle'); return; }
    const { upload_url, storage_path } = await sig.json();

    setProgress('uploading');
    const up = await fetch(upload_url, {
      method: 'PUT', body: file, headers: { 'Content-Type': file.type },
    });
    if (!up.ok) { setErr(`Upload failed (${up.status})`); setProgress('idle'); return; }

    setProgress('saving');
    const save = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_path: storage_path }),
    });
    if (!save.ok) { setErr('Save failed.'); setProgress('idle'); return; }
    onSaved((await save.json()).item);
    setPreviewPath(storage_path);
    setProgress('done');
  }

  const previewUrl = previewPath ? PREVIEW_URL(previewPath) : null;

  return (
    <div className="space-y-4">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="rounded-lg max-w-md max-h-80 object-cover border" />
      ) : (
        <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-slate-500">
          No photo uploaded
        </div>
      )}
      <label className="block">
        <span className="block text-xs font-medium mb-1">
          Upload photo (JPG / PNG / WEBP / HEIC, max 5 MB)
        </span>
        <input
          type="file"
          accept={ALLOWED.join(',')}
          onChange={onPick}
          disabled={progress !== 'idle' && progress !== 'done'}
        />
      </label>
      {progress !== 'idle' && (
        <p className="text-sm text-slate-500">Status: {progress}</p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
