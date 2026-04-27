'use client';
import { useState, useRef } from 'react';
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { uploadAssetAction } from '../actions';

// Drag-and-drop uploader. Submits one file at a time via the server
// action (no parallel for now — keeps Supabase Storage rate-limit
// pressure low). Shows per-file progress + tally.

type UploadJob = {
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
};

export function Uploader({
  building,
  listingId,
  category,
}: {
  building?: string | null;
  listingId?: string | null;
  category?: 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative';
}) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File, idx: number) {
    setJobs(j => j.map((x, i) => i === idx ? { ...x, status: 'uploading' } : x));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('file_name', file.name);
      if (building) fd.append('building', building);
      if (listingId) fd.append('listing_id', listingId);
      if (category) fd.append('category', category);
      await uploadAssetAction(fd);
      setJobs(j => j.map((x, i) => i === idx ? { ...x, status: 'done' } : x));
    } catch (e) {
      setJobs(j => j.map((x, i) => i === idx
        ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'upload_failed' }
        : x));
    }
  }

  async function startUpload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    const newJobs: UploadJob[] = files.map(f => ({ name: f.name, size: f.size, status: 'pending' }));
    setJobs(prev => [...prev, ...newJobs]);
    const startIdx = jobs.length;
    for (let i = 0; i < files.length; i++) {
      await uploadOne(files[i], startIdx + i);
    }
    setBusy(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    startUpload(files);
  }

  return (
    <div className="space-y-3">
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
          50MB max per file · JPG/PNG/WEBP/HEIC + MP4/WEBM · AI labels in ~2 min
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
            const files = Array.from(e.target.files || []);
            startUpload(files);
            e.target.value = '';
          }}
        />
      </div>

      {jobs.length > 0 && (
        <div className="ix-card p-3 space-y-1 text-sm max-h-60 overflow-y-auto">
          {jobs.map((j, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="truncate flex-1">{j.name}</span>
              <span className="text-slate-400 tabular-nums">{(j.size / 1024 / 1024).toFixed(1)} MB</span>
              <span className="w-24 text-right">
                {j.status === 'pending' && <span className="text-slate-400">queued</span>}
                {j.status === 'uploading' && <Loader2 size={12} className="inline animate-spin text-slate-500" />}
                {j.status === 'done' && (
                  <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={11} /> done</span>
                )}
                {j.status === 'error' && (
                  <span className="text-rose-600 inline-flex items-center gap-1" title={j.error}>
                    <AlertTriangle size={11} /> error
                  </span>
                )}
              </span>
            </div>
          ))}
          {!busy && jobs.some(j => j.status === 'done') && (
            <p className="text-[10px] text-slate-500 pt-1">
              Refresh page to see new assets in the grid.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
