'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { signGalleryUploadAction, registerGalleryUploadAction } from '../actions';
import { supabaseBrowser } from '@/lib/supabase-browser';

export type AlbumKey = {
  building: string | null;
  listingId: string | null;
  unitTemplateId?: string | null;   // when set, scope is the shared template library
};

export type UploadJobCategory = 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative';

export type UploadJob = {
  id: string;
  file: File;
  building: string | null;
  listingId: string | null;
  category: UploadJobCategory;
  status: 'queued' | 'compressing' | 'uploading' | 'done' | 'error';
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  compressPercent?: number; // 0–100 when status === 'compressing'
};

type GalleryContextValue = {
  // Upload tray
  jobs: UploadJob[];
  enqueueUpload: (
    files: File[],
    target: { building: string | null; listingId: string | null; category?: UploadJobCategory },
  ) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  clearFinished: () => void;

  // Selection
  selection: Set<string>;
  selectionAlbum: AlbumKey | null;
  isSelected: (id: string) => boolean;
  toggleSelected: (id: string, album: AlbumKey) => void;
  selectRange: (anchorId: string, targetId: string, idsInOrder: string[], album: AlbumKey) => void;
  selectAll: (ids: string[], album: AlbumKey) => void;
  clearSelection: () => void;
};

const GalleryContext = createContext<GalleryContextValue | null>(null);
const MAX_CONCURRENT = 3;

function categoryForMime(mime: string): UploadJobCategory {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function sameAlbum(a: AlbumKey, b: AlbumKey | null): boolean {
  if (!b) return false;
  // Templated albums match on (building + unitTemplateId); listingId is
  // ignored because every member of the template shares the same library.
  if (a.unitTemplateId || b.unitTemplateId) {
    return a.building === b.building && (a.unitTemplateId || null) === (b.unitTemplateId || null);
  }
  return a.building === b.building && a.listingId === b.listingId;
}

export function GalleryProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionAlbum, setSelectionAlbum] = useState<AlbumKey | null>(null);
  const lastAnchorRef = useRef<string | null>(null);

  // Worker effect: whenever jobs change, kick the next queued job if a
  // slot is free. Direct-to-Supabase signed-URL upload bypasses Vercel's
  // ~4.5 MB serverless body cap. Flow:
  //   1. signGalleryUploadAction → server returns { signedUrl, path, token, bucket }
  //   2. supabaseBrowser().storage.uploadToSignedUrl(...) → bytes go straight to Supabase
  //   3. registerGalleryUploadAction → server inserts the DB row + queues AI label
  useEffect(() => {
    const inFlight = jobs.filter(j => j.status === 'uploading' || j.status === 'compressing').length;
    if (inFlight >= MAX_CONCURRENT) return;

    // Compressions are SERIALIZED: only one ffmpeg.wasm worker at a time.
    // Two concurrent 31MB-WASM workers + their working memory blow past
    // browser heap caps on a 60MB+ video and the first worker dies.
    // Image uploads and small-video uploads still go in parallel up to
    // MAX_CONCURRENT — only the compress step is exclusive.
    const isCompressInFlight = jobs.some(j => j.status === 'compressing');

    const next = jobs.find(j => {
      if (j.status !== 'queued') return false;
      const jobIsVideo = (j.file.type || '').startsWith('video/');
      const jobNeedsCompress = jobIsVideo && j.file.size > 50_000_000;
      // Skip queued compress jobs while another compression runs;
      // we'll pick them up when the current compress slot frees.
      if (jobNeedsCompress && isCompressInFlight) return false;
      return true;
    });
    if (!next) return;

    const isVideo = (next.file.type || '').startsWith('video/');
    const needsCompress = isVideo && next.file.size > 50_000_000;

    // Move to the right starting state.
    setJobs(prev => prev.map(j => j.id === next.id
      ? { ...j, status: needsCompress ? 'compressing' as const : 'uploading' as const, startedAt: Date.now(), compressPercent: needsCompress ? 0 : undefined }
      : j));

    (async () => {
      try {
        let fileToUpload = next.file;

        if (needsCompress) {
          const { compressVideoToFit } = await import('@/lib/media/video-compress');
          fileToUpload = await compressVideoToFit(next.file, {
            onProgress: (p) => {
              if (p.phase === 'encoding') {
                // Smooth two-pass progress: pass 1 = 0–50%, pass 2 = 50–100%.
                const overall = p.pass === 1 ? p.percent / 2 : 50 + p.percent / 2;
                setJobs(prev => prev.map(j => j.id === next.id
                  ? { ...j, compressPercent: Math.round(overall) }
                  : j));
              }
            },
          });
          // Transition to uploading.
          setJobs(prev => prev.map(j => j.id === next.id
            ? { ...j, status: 'uploading' as const, compressPercent: undefined, file: fileToUpload }
            : j));
        }

        const mime = fileToUpload.type || 'application/octet-stream';
        const signed = await signGalleryUploadAction({
          fileName: fileToUpload.name,
          mime,
          building: next.building,
          listingId: next.listingId,
          category: next.category,
        });
        if (!signed.ok) throw new Error(`sign_failed: ${signed.error}`);

        const sb = supabaseBrowser();
        const { error: upErr } = await sb.storage
          .from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, fileToUpload, {
            contentType: mime,
            upsert: false,
          });
        if (upErr) throw new Error(`storage_upload_failed: ${upErr.message}`);

        const reg = await registerGalleryUploadAction({
          path: signed.path,
          bucket: signed.bucket,
          fileName: fileToUpload.name,
          mime,
          sizeBytes: fileToUpload.size,
          building: next.building,
          listingId: next.listingId,
          category: next.category,
        });
        if (!reg.ok) throw new Error(`register_failed: ${reg.error}`);

        setJobs(prev => prev.map(j => j.id === next.id
          ? { ...j, status: 'done' as const, finishedAt: Date.now() }
          : j));
      } catch (e) {
        setJobs(prev => prev.map(j => j.id === next.id
          ? { ...j, status: 'error' as const, error: e instanceof Error ? e.message : 'upload_failed', finishedAt: Date.now() }
          : j));
      }
    })();
  }, [jobs]);

  const enqueueUpload: GalleryContextValue['enqueueUpload'] = useCallback((files, target) => {
    if (files.length === 0) return;
    const newJobs: UploadJob[] = files.map(f => ({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      file: f,
      building: target.building,
      listingId: target.listingId,
      category: target.category || categoryForMime(f.type),
      status: 'queued',
    }));
    setJobs(prev => [...prev, ...newJobs]);
  }, []);

  const cancelJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => !(j.id === id && j.status === 'queued')));
  }, []);

  const retryJob = useCallback((id: string) => {
    setJobs(prev => prev.map(j => j.id === id && j.status === 'error'
      ? { ...j, status: 'queued' as const, error: undefined }
      : j));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status !== 'done' && j.status !== 'error'));
  }, []);

  const toggleSelected = useCallback((id: string, album: AlbumKey) => {
    setSelection(prev => {
      if (selectionAlbum && !sameAlbum(album, selectionAlbum)) {
        const fresh = new Set([id]);
        setSelectionAlbum(album);
        lastAnchorRef.current = id;
        return fresh;
      }
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        lastAnchorRef.current = id;
      }
      if (next.size === 0) setSelectionAlbum(null);
      else if (!selectionAlbum) setSelectionAlbum(album);
      return next;
    });
  }, [selectionAlbum]);

  const selectRange = useCallback((anchorId: string, targetId: string, idsInOrder: string[], album: AlbumKey) => {
    const anchorIdx = idsInOrder.indexOf(anchorId);
    const targetIdx = idsInOrder.indexOf(targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const [from, to] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const range = idsInOrder.slice(from, to + 1);
    setSelection(prev => {
      const next = new Set(prev);
      for (const id of range) next.add(id);
      return next;
    });
    setSelectionAlbum(album);
  }, []);

  const selectAll = useCallback((ids: string[], album: AlbumKey) => {
    setSelection(new Set(ids));
    setSelectionAlbum(album);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setSelectionAlbum(null);
    lastAnchorRef.current = null;
  }, []);

  const value: GalleryContextValue = {
    jobs,
    enqueueUpload,
    cancelJob,
    retryJob,
    clearFinished,
    selection,
    selectionAlbum,
    isSelected: (id: string) => selection.has(id),
    toggleSelected,
    selectRange,
    selectAll,
    clearSelection,
  };

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

export function useGallery(): GalleryContextValue {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error('useGallery must be used inside GalleryProvider');
  return ctx;
}
