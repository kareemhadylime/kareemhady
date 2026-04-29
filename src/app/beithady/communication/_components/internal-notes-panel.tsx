'use client';
import { useState } from 'react';
import { StickyNote, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { addInternalNoteAction, deleteInternalNoteAction } from '../polish-actions';

// Q.4 #3 — internal notes panel between header and message list.
// Staff-only V1, no guest-visible mode.

export type InternalNote = {
  id: string;
  author_user_id: string;
  author_username: string | null;
  body: string;
  created_at: string;
};

export function InternalNotesPanel({
  conversationId,
  notes,
  returnTo,
}: {
  conversationId: string;
  notes: InternalNote[];
  returnTo: string;
}) {
  const [open, setOpen] = useState(notes.length > 0);
  const [body, setBody] = useState('');

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 bg-amber-50/50 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition"
      >
        <span className="inline-flex items-center gap-1.5">
          <StickyNote size={11} /> Internal notes
          {notes.length > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[10px]">
              {notes.length}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="px-3 pb-2 pt-1 space-y-2">
          {notes.map(n => (
            <div key={n.id} className="bg-white dark:bg-slate-900 rounded p-2 text-xs flex items-start gap-2">
              <div className="flex-1">
                <div className="text-[10px] text-slate-500 mb-0.5">
                  {n.author_username || 'staff'} · {fmtCairoDateTime(n.created_at)}
                </div>
                <div className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{n.body}</div>
              </div>
              <form action={deleteInternalNoteAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="text-slate-400 hover:text-rose-600 transition"
                  title="Delete note"
                >
                  <Trash2 size={11} />
                </button>
              </form>
            </div>
          ))}

          <form action={addInternalNoteAction} className="flex items-end gap-1.5">
            <input type="hidden" name="conversation_id" value={conversationId} />
            <input type="hidden" name="return_to" value={returnTo} />
            <textarea
              name="body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Add an internal note (visible only to staff)…"
              rows={2}
              className="ix-input flex-1 text-xs resize-none"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!body.trim()}
              className="ix-btn-primary text-xs px-2 py-1.5 disabled:opacity-50"
            >
              <Plus size={11} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
