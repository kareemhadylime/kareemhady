'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Camera, FolderOpen, X, Image as ImageIcon, Check, Loader2, AlertTriangle } from 'lucide-react';
import {
  sendWaCasualMultiAttachResult,
  sendGuestyMultiAttachResult,
  createMediaSignedUploadUrl,
} from '../attach-actions';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { LibraryPicker, type LibraryAttachment } from './library-picker';

function extFromMimeBrowser(mime: string): string {
  // Video first — must precede 'mp4' substring check so video/mp4 doesn't
  // get tagged with the audio .m4a extension.
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/3gpp') return '3gp';
  if (mime === 'video/x-msvideo') return 'avi';
  if (mime === 'video/x-matroska') return 'mkv';
  if (mime.startsWith('video/')) return 'mp4';
  // Audio
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  // Images / docs
  if (mime.startsWith('image/jpeg')) return 'jpg';
  if (mime.startsWith('image/png')) return 'png';
  if (mime.startsWith('image/webp')) return 'webp';
  if (mime.startsWith('image/gif')) return 'gif';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

// Phase Q.3 — AttachmentMenu dropdown wrapping Device / Camera / Library.
// Holds a queue of pending attachments (file blobs + library refs)
// before send. Clicking Send fires the appropriate multi-attach server
// action with up to 5 files in one form submission.

const MAX_FILES = 5;

export type PendingItem =
  | { kind: 'file'; file: File; previewUrl: string | null }
  | { kind: 'lib'; url: string; name: string; mime: string; previewUrl: string };

export function AttachmentMenu({
  conversationId,
  channel,
  buildingCode,
  caption,
  module,
}: {
  conversationId: string;
  channel: 'guesty' | 'wa_casual';
  buildingCode: string | null;
  caption: string;
  module?: 'whatsapp' | 'email' | 'sms' | 'log' | 'airbnb2' | 'bookingCom';
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [stalled, setStalled] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Watchdog: if isPending hasn't resolved within 90s, surface a stall
  // banner so the user can cancel and retry. Vercel's serverless
  // function default timeout is 60s — anything past 90s on the client
  // means the action either crashed without redirecting or got
  // swallowed at the edge layer.
  useEffect(() => {
    if (!isPending) {
      setStalled(false);
      return;
    }
    const id = setTimeout(() => setStalled(true), 90_000);
    return () => clearTimeout(id);
  }, [isPending]);

  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    e.target.value = '';
  };

  const addFiles = (files: File[]) => {
    const next: PendingItem[] = [...items];
    for (const f of files) {
      if (next.length >= MAX_FILES) break;
      // Generate a previewUrl for both images and videos — the
      // preview grid renders <img> for images and <video> for videos.
      const previewUrl = (f.type.startsWith('image/') || f.type.startsWith('video/'))
        ? URL.createObjectURL(f)
        : null;
      next.push({ kind: 'file', file: f, previewUrl });
    }
    setItems(next);
    setOpen(false);
  };

  const addLibraryItems = (libItems: LibraryAttachment[]) => {
    const next: PendingItem[] = [...items];
    for (const li of libItems) {
      if (next.length >= MAX_FILES) break;
      next.push({
        kind: 'lib',
        url: li.url,
        name: li.name,
        mime: li.mime,
        previewUrl: li.url,
      });
    }
    setItems(next);
    setLibOpen(false);
    setOpen(false);
  };

  const removeAt = (i: number) => {
    const next = [...items];
    const [removed] = next.splice(i, 1);
    if (removed && removed.kind === 'file' && removed.previewUrl) {
      try { URL.revokeObjectURL(removed.previewUrl); } catch { /* ignore */ }
    }
    setItems(next);
  };

  const router = useRouter();
  const action = channel === 'guesty' ? sendGuestyMultiAttachResult : sendWaCasualMultiAttachResult;

  // Direct-to-Storage upload pattern. Sending file bytes through a
  // server action via useTransition repeatedly failed with React's
  // "unexpected response" / transport errors at the framework layer
  // (most likely Vercel function body re-encoding for large multipart).
  //
  // Bypass: upload each file directly to Supabase Storage via signed
  // upload URL (no Vercel function in the path), THEN call the action
  // with library_url_${i} entries pointing at the resulting public
  // URLs. Action payload is now URL-strings only — small + fast.
  const handleSend = () => {
    if (items.length === 0 || isPending) return;
    setErrorMsg(null);
    startTransition(async () => {
      // Audit fix C-E1: track storage paths the CLIENT uploaded so we
      // can clean them up on partial-failure send. Pre-fix, every file
      // we uploaded stayed in beithady-wa-media forever even if the
      // send failed before reaching the recipient — orphan blobs in
      // perpetuity. Library items (kind==='lib') are pre-existing
      // assets and are NOT cleaned up.
      const uploadedPathsForCleanup: string[] = [];
      try {
        // Step 1 — upload every file item directly to Supabase Storage.
        // Library items already have URLs and are passed through.
        type Resolved = { url: string; name: string; mime: string; clientUploadedPath?: string };
        const resolved: Resolved[] = [];
        const sb = supabaseBrowser();
        for (const it of items) {
          if (it.kind === 'lib') {
            resolved.push({ url: it.url, name: it.name, mime: it.mime });
            continue;
          }
          const mime = it.file.type || 'application/octet-stream';
          const ext = extFromMimeBrowser(mime);
          const signed = await createMediaSignedUploadUrl(ext);
          if (!signed.ok) {
            setErrorMsg(`signed_url_failed: ${signed.error}`);
            // Cleanup any prior uploads from this batch.
            if (uploadedPathsForCleanup.length > 0) {
              await sb.storage.from('beithady-wa-media').remove(uploadedPathsForCleanup).catch(() => {});
            }
            return;
          }
          const { error: upErr } = await sb.storage
            .from('beithady-wa-media')
            .uploadToSignedUrl(signed.path, signed.token, it.file, {
              contentType: mime,
              upsert: false,
            });
          if (upErr) {
            setErrorMsg(`storage_upload_failed: ${upErr.message}`);
            if (uploadedPathsForCleanup.length > 0) {
              await sb.storage.from('beithady-wa-media').remove(uploadedPathsForCleanup).catch(() => {});
            }
            return;
          }
          uploadedPathsForCleanup.push(signed.path);
          resolved.push({ url: signed.publicUrl, name: it.file.name || 'file', mime, clientUploadedPath: signed.path });
        }

        // Step 2 — call the multi-attach action with all entries as
        // library refs. Action only sees URL strings now — no file
        // bytes, no multipart-through-Vercel issues.
        const fd = new FormData();
        fd.append('conversation_id', conversationId);
        fd.append('body', caption);
        if (channel === 'guesty' && module) fd.append('module', module);
        resolved.forEach((r, i) => {
          fd.append(`library_url_${i}`, r.url);
          fd.append(`library_name_${i}`, r.name);
          fd.append(`library_mime_${i}`, r.mime);
          // Pass the cleanup path so the server can delete unsent
          // uploads if the multi-send loop breaks partway.
          if (r.clientUploadedPath) {
            fd.append(`cleanup_path_${i}`, r.clientUploadedPath);
          }
        });
        const result = await action(fd);

        if (result.ok) {
          for (const it of items) {
            if (it.kind === 'file' && it.previewUrl) {
              try { URL.revokeObjectURL(it.previewUrl); } catch { /* ignore */ }
            }
          }
          setItems([]);
          if (result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
        } else {
          // Server already cleaned up unsent uploads (audit fix C-E1).
          // Just surface the error.
          setErrorMsg((result.error || 'unknown_error').slice(0, 240));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg.slice(0, 240));
        // Best-effort: try to clean up anything we uploaded before the throw.
        if (uploadedPathsForCleanup.length > 0) {
          try {
            const sb = supabaseBrowser();
            await sb.storage.from('beithady-wa-media').remove(uploadedPathsForCleanup);
          } catch { /* ignore */ }
        }
      }
    });
  };

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title="Attach files / library"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition relative"
        >
          <Paperclip size={16} />
          {items.length > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-600 text-white text-[10px] font-bold">
              {items.length}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute bottom-12 left-0 z-30 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-slate-800 transition"
            >
              <FolderOpen size={14} /> From device
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-slate-800 transition"
            >
              <Camera size={14} /> Camera
            </button>
            <button
              type="button"
              onClick={() => { setLibOpen(true); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-slate-800 transition border-t border-slate-200 dark:border-slate-700"
            >
              <ImageIcon size={14} /> Listing library
              <span className="ml-auto text-[10px] text-slate-400">{buildingCode || '—'}</span>
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*,application/pdf"
          onChange={pickFiles}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*"
          capture="environment"
          onChange={pickFiles}
        />
      </div>

      {libOpen && (
        <LibraryPicker
          buildingCode={buildingCode}
          onCancel={() => setLibOpen(false)}
          onConfirm={addLibraryItems}
          maxToAdd={MAX_FILES - items.length}
        />
      )}

      {items.length > 0 && (
        // No <form> wrapper — we submit programmatically via
        // useTransition + the imported server action. Avoids both the
        // nested-form bug (illegal HTML, browser strips inner form)
        // AND the formAction re-binding edge case in React 19 +
        // Next.js 16 server actions. The button is type="button"; click
        // builds FormData from items + caption + module and calls
        // action(fd) directly inside startTransition.
        <div className="ix-card p-2 mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            {items.map((it, i) => {
              const mime = it.kind === 'file' ? it.file.type : it.mime;
              const isVideo = mime.startsWith('video/');
              const isImage = mime.startsWith('image/');
              const label = it.kind === 'file' ? it.file.name : it.name;
              return (
                <div key={i} className="relative group">
                  {it.previewUrl && isVideo ? (
                    <video
                      src={it.previewUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-700 bg-black"
                    />
                  ) : it.previewUrl && isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.previewUrl}
                      alt={label}
                      className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800 p-1 text-center break-all">
                      {label.slice(0, 14)}
                    </div>
                  )}
                  {isVideo && (
                    <span className="absolute bottom-0.5 left-0.5 px-1 py-px rounded bg-black/60 text-white text-[9px] font-bold leading-none">
                      VIDEO
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white inline-flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition"
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{items.length} ready · max {MAX_FILES}</span>
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending}
              className="ix-btn-primary text-xs disabled:opacity-50"
            >
              {isPending
                ? <><Loader2 size={11} className="animate-spin" /> Sending…</>
                : <><Check size={11} /> Send {items.length}</>}
            </button>
          </div>

          {isPending && !stalled && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950 dark:border-violet-800 p-2 text-xs text-violet-800 dark:text-violet-200 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">Uploading {items.length} {items.length === 1 ? 'file' : 'files'}…</div>
                <div className="text-[10px] opacity-80 mt-0.5">
                  Files upload to Supabase storage, then post to Guesty. Average ~3s per file.
                </div>
              </div>
              <div className="ml-auto w-16 h-1 rounded-full bg-violet-200 dark:bg-violet-900 overflow-hidden shrink-0">
                <div className="h-full w-1/2 bg-violet-600 animate-pulse" />
              </div>
            </div>
          )}

          {/* Audit fix H-E7: error block moved out of the items.length
              wrapper below + dismissable X. Pre-fix the operator could
              remove all items and the error banner would disappear
              along with the wrapper, leaving no record of the failed
              send. (See bottom of component for the new placement.) */}

          {stalled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold">Send appears to have stalled.</div>
                <div className="text-[10px] opacity-90">
                  No response from server after 90s. Check Settings → Audit for any &quot;multi_attach_guesty&quot; row
                  to confirm whether the send actually went through. Reload the page to clear and retry.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit fix H-E7: error block lives outside the items.length
          wrapper so it persists even after the operator removes all
          attachments. Includes a dismiss X. */}
      {errorMsg && !isPending && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-2 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2 mt-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1 min-w-0">
            <div className="font-semibold">Send failed.</div>
            <div className="text-[10px] opacity-90 break-all">{errorMsg}</div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            title="Dismiss"
            className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </>
  );
}

// Note: NativeFileBag (DataTransfer + hidden input rebinding for
// native form submission) was removed when the submit path switched
// to programmatic action invocation via useTransition. FormData is
// built directly from the items[] state in handleSend.
