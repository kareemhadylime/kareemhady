'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, AlertTriangle, Camera } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';

// Direct-to-Supabase image uploader. Bypasses the Vercel Server Action
// body limit (~4.5MB) by:
//   1. Asking the server for a signed upload URL per file
//   2. Browser PUTs the file bytes directly to Supabase Storage
//   3. Server inserts the boat_rental_boat_images row pointing at the path
//
// Multiple files are uploaded sequentially (not parallel) so we don't
// fight bucket rate limits and so a single failure doesn't poison the
// other uploads.

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; current: number; total: number; fileName: string }
  | { kind: 'error'; message: string };

export function BoatImageUploader({ boatId, slotsLeft }: { boatId: string; slotsLeft: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function uploadOne(file: File): Promise<void> {
    if (!ALLOWED_MIME.has(file.type)) throw new Error(`${file.name}: unsupported type`);
    if (file.size === 0 || file.size > MAX_BYTES) throw new Error(`${file.name}: must be <= 5MB`);

    // 1. Sign
    const signRes = await fetch('/api/boat-rental/admin/boat-image/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boatId, mime: file.type, size: file.size }),
    });
    if (!signRes.ok) {
      const j = await signRes.json().catch(() => ({}));
      throw new Error(`${file.name}: sign failed (${j.error || signRes.status})`);
    }
    const { signedUrl, path } = (await signRes.json()) as { signedUrl: string; path: string; token: string };

    // 2. Direct upload to Supabase Storage
    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
      body: file,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      throw new Error(`${file.name}: upload failed (${putRes.status}) ${text.slice(0, 100)}`);
    }

    // 3. Attach the row
    const attachRes = await fetch('/api/boat-rental/admin/boat-image/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boatId, path }),
    });
    if (!attachRes.ok) {
      const j = await attachRes.json().catch(() => ({}));
      throw new Error(`${file.name}: attach failed (${j.error || attachRes.status})`);
    }
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.currentTarget.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, slotsLeft); // respect remaining slots

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setStatus({ kind: 'uploading', current: i + 1, total: files.length, fileName: f.name });
      try {
        await uploadOne(f);
        succeeded++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : 'unknown';
        toast(msg, { kind: 'error', duration: 5000 });
      }
    }

    if (succeeded > 0) {
      hapticSuccess();
      toast(`Uploaded ${succeeded} photo${succeeded === 1 ? '' : 's'}`, { kind: 'success' });
    }
    if (failed > 0 && succeeded === 0) hapticError();

    if (inputRef.current) inputRef.current.value = '';
    setStatus({ kind: 'idle' });
    router.refresh();
  }

  if (slotsLeft <= 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Maximum 10 images per boat reached. Remove one before adding another.
      </p>
    );
  }

  const uploading = status.kind === 'uploading';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-sm flex-1 min-w-[220px]">
          <span className="text-slate-600 dark:text-slate-300 text-xs">
            Add photos (JPG/PNG/WEBP, 5MB max each)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            disabled={uploading}
            onChange={onChange}
            className="ix-input mt-1 cursor-pointer disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="ix-btn-secondary disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {uploading ? 'Uploading…' : 'Choose photos'}
        </button>
      </div>

      {status.kind === 'uploading' && (
        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Upload size={12} />
          Uploading {status.current} of {status.total}: {status.fileName}
        </div>
      )}
      {status.kind === 'error' && (
        <div className="text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle size={12} />
          {status.message}
        </div>
      )}
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Photos upload directly to storage — no Server Action body limit. Each upload is independent: if one fails, the rest continue.
      </p>
    </div>
  );
}
