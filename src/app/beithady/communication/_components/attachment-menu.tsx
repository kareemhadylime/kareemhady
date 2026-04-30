'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Paperclip, Camera, FolderOpen, X, Image as ImageIcon, Check, Loader2, AlertTriangle } from 'lucide-react';
import { sendWaCasualMultiAttachAction, sendGuestyMultiAttachAction } from '../attach-actions';
import { LibraryPicker, type LibraryAttachment } from './library-picker';

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
      const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
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

  const action = channel === 'guesty' ? sendGuestyMultiAttachAction : sendWaCasualMultiAttachAction;

  // Programmatic submit. Bypasses native <form> submission entirely —
  // the previous formAction-on-button approach silently dropped the
  // request in React 19 + Next.js 16 (no audit row, no storage object,
  // confirmed empty post-click). Build FormData ourselves, call the
  // action inside startTransition so isPending tracks the round-trip,
  // and let Next.js handle redirect + revalidate as usual.
  const handleSend = () => {
    if (items.length === 0 || isPending) return;
    setErrorMsg(null);
    const fd = new FormData();
    fd.append('conversation_id', conversationId);
    fd.append('body', caption);
    if (channel === 'guesty' && module) fd.append('module', module);
    items.forEach((it, i) => {
      if (it.kind === 'file') {
        fd.append(`file_${i}`, it.file, it.file.name);
      } else {
        fd.append(`library_url_${i}`, it.url);
        fd.append(`library_name_${i}`, it.name);
        fd.append(`library_mime_${i}`, it.mime);
      }
    });
    startTransition(async () => {
      try {
        await action(fd);
        // On success, the server action redirects → page navigates → this
        // component unmounts. We never reach here on a clean redirect.
      } catch (e) {
        // Next.js redirect throws a special error that the framework
        // catches above us. ANY error reaching here is a real failure —
        // surface it.
        const msg = e instanceof Error ? e.message : String(e);
        // The framework intercepts redirects with a NEXT_REDIRECT
        // sentinel; we never see those. Any other error is a real
        // server failure (validation throw, network blip, etc.).
        if (!msg.includes('NEXT_REDIRECT')) {
          setErrorMsg(msg.slice(0, 240));
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
          accept="image/*,application/pdf"
          onChange={pickFiles}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
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
            {items.map((it, i) => (
              <div key={i} className="relative group">
                {it.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.previewUrl}
                    alt={it.kind === 'file' ? it.file.name : it.name}
                    className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800 p-1 text-center break-all">
                    {it.kind === 'file' ? it.file.name.slice(0, 14) : it.name.slice(0, 14)}
                  </div>
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
            ))}
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

          {errorMsg && !isPending && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-2 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold">Send failed.</div>
                <div className="text-[10px] opacity-90 break-all">{errorMsg}</div>
              </div>
            </div>
          )}

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
    </>
  );
}

// Note: NativeFileBag (DataTransfer + hidden input rebinding for
// native form submission) was removed when the submit path switched
// to programmatic action invocation via useTransition. FormData is
// built directly from the items[] state in handleSend.
