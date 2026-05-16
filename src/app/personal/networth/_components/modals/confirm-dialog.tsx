'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** JSX is allowed so callers can render multi-paragraph or emphasized copy. */
  message: React.ReactNode;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** `danger` renders the confirm button in rose and shows a warning icon. */
  tone?: 'default' | 'danger';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
};

/**
 * Shared confirm-modal for the Net Worth module. Replaces every native
 * `window.confirm` / `window.alert` so destructive actions look the same as
 * the rest of the module's modal pattern (`add-asset-modal.tsx` etc.).
 *
 * Behavior:
 *  - returns null when `!open`
 *  - backdrop click cancels
 *  - clicks inside the card do NOT cancel
 *  - Escape dismisses
 *  - confirm button focuses on open
 *  - shows "Working…" while `onConfirm` resolves; buttons disabled meanwhile
 *  - inline error text if `onConfirm` throws (cancel re-enables)
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Reset internal state whenever the dialog re-opens. Otherwise a previous
  // error or a stuck `working` could leak into the next confirm.
  useEffect(() => {
    if (open) {
      setError(null);
      setWorking(false);
    }
  }, [open]);

  // Escape dismisses (only when open and not in-flight).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !working) {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, working, onCancel]);

  // Focus the confirm button on open (basic a11y — not a full focus trap).
  useEffect(() => {
    if (open) {
      // Schedule the focus after the element exists in the DOM.
      const id = requestAnimationFrame(() => {
        confirmRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  if (!open) return null;

  function handleCancel() {
    if (working) return;
    onCancel();
  }

  async function handleConfirm() {
    setError(null);
    setWorking(true);
    try {
      await onConfirm();
      // Caller is responsible for closing the dialog (onConfirm sets pending=null).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWorking(false);
    }
  }

  const isDanger = tone === 'danger';
  const confirmClass = isDanger
    ? 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white font-medium shadow-sm hover:bg-rose-700 active:bg-rose-800 transition min-h-[44px] disabled:opacity-50'
    : 'ix-btn-primary disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="ix-card w-full max-w-md bg-white dark:bg-slate-900 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-2">
            {isDanger && (
              <AlertTriangle
                size={18}
                className="text-rose-600 dark:text-rose-400 mt-0.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <h3
              id="confirm-dialog-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-50"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={working}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-300 mt-2">
          {message}
        </div>

        {error && (
          <div className="mt-3 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={working}
            className="ix-btn-secondary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={handleConfirm}
            disabled={working}
            className={confirmClass}
          >
            {working ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
