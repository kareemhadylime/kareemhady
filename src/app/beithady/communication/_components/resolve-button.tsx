'use client';
import { useState } from 'react';
import { CheckCircle2, X, Undo2 } from 'lucide-react';
import { markResolvedAction, unmarkResolvedAction } from '../polish-actions';

// Q.4 #5 — mark-resolved with reason dropdown.

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'resolved', label: 'Resolved · guest issue handled' },
  { value: 'booked', label: 'Booked · converted to reservation' },
  { value: 'no_response', label: 'No response · guest went silent' },
  { value: 'spam', label: 'Spam / wrong number' },
  { value: 'duplicate', label: 'Duplicate · merged with another thread' },
];

export function ResolveButton({
  conversationId,
  resolvedAt,
  resolvedReason,
  returnTo,
  inHouseWarning,
}: {
  conversationId: string;
  resolvedAt: string | null;
  resolvedReason: string | null;
  returnTo: string;
  inHouseWarning?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('resolved');

  if (resolvedAt) {
    const reasonLabel = REASONS.find(r => r.value === resolvedReason)?.label || 'Resolved';
    return (
      <form action={unmarkResolvedAction} className="inline-block">
        <input type="hidden" name="conversation_id" value={conversationId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <button
          type="submit"
          className="ix-btn-secondary text-xs"
          title={`Re-open this conversation (was: ${reasonLabel})`}
        >
          <Undo2 size={12} /> Re-open
        </button>
      </form>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ix-btn-secondary text-xs"
        title="Mark this conversation resolved + close"
      >
        <CheckCircle2 size={12} /> Resolve
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="ix-card p-4 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Mark resolved</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
            {inHouseWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-200">
                Guest is currently in-house. Resolving here closes the inbox thread but doesn't end their stay.
              </div>
            )}
            <form action={markResolvedAction} className="space-y-2">
              <input type="hidden" name="conversation_id" value={conversationId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <div>
                <label className="block text-xs font-medium mb-1">Reason</label>
                <select
                  name="reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="ix-input w-full text-sm"
                >
                  {REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="ix-btn-secondary text-xs">Cancel</button>
                <button type="submit" className="ix-btn-primary text-xs">
                  <CheckCircle2 size={12} /> Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
