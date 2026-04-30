'use client';
import { useRef, useState } from 'react';
import { Paperclip, Camera, FolderOpen, X, Image as ImageIcon, Check, Loader2 } from 'lucide-react';
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
  const [submitting, setSubmitting] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
        <form
          action={action}
          encType="multipart/form-data"
          className="ix-card p-2 mt-2 space-y-2"
          onSubmit={() => setSubmitting(true)}
        >
          <input type="hidden" name="conversation_id" value={conversationId} />
          <input type="hidden" name="body" value={caption} />
          {channel === 'guesty' && module && (
            <input type="hidden" name="module" value={module} />
          )}
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
                {it.kind === 'lib' && (
                  <>
                    <input type="hidden" name={`library_url_${i}`} value={it.url} />
                    <input type="hidden" name={`library_name_${i}`} value={it.name} />
                    <input type="hidden" name={`library_mime_${i}`} value={it.mime} />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Browser File objects can't be re-submitted via hidden input,
              so we render a single visible multi-file input that includes
              the same files. Each PendingItem is bound to its native File
              by index using a single shared `files[]` input. */}
          <NativeFileBag items={items} />

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{items.length} ready · max {MAX_FILES}</span>
            <button
              type="submit"
              disabled={submitting}
              className="ix-btn-primary text-xs disabled:opacity-50"
            >
              {submitting
                ? <><Loader2 size={11} className="animate-spin" /> Sending…</>
                : <><Check size={11} /> Send {items.length}</>}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

// Workaround: re-binding File objects to a hidden multi-input per submit.
// Use a DataTransfer to populate the input.files at form submit time so
// the server action receives them under name=file_N.
function NativeFileBag({ items }: { items: PendingItem[] }) {
  const refs = useRef<Map<number, HTMLInputElement>>(new Map());
  const setRef = (i: number) => (el: HTMLInputElement | null) => {
    if (el) {
      refs.current.set(i, el);
      const f = items[i];
      if (f && f.kind === 'file') {
        const dt = new DataTransfer();
        dt.items.add(f.file);
        el.files = dt.files;
      }
    }
  };
  return (
    <>
      {items.map((it, i) =>
        it.kind === 'file' ? (
          <input
            key={`bag-${i}`}
            ref={setRef(i)}
            type="file"
            name={`file_${i}`}
            className="hidden"
          />
        ) : null,
      )}
    </>
  );
}
