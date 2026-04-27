'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Reusable confirm-write modal — wraps an action with a "this will
// modify Guesty/local data" warning per user requirement Q4 ("Guesty
// Read-Write with clear Notes to Agent").

export function ConfirmWriteModal({
  title,
  description,
  warningType,
  onConfirm,
  onCancel,
  pending,
  children,
}: {
  title: string;
  description: string;
  warningType: 'guesty_write' | 'local_only' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const banner = warningType === 'guesty_write'
    ? {
        bg: 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 border-amber-300',
        text: 'This action will modify Guesty data. Changes are written to Guesty first, then mirrored locally.',
      }
    : warningType === 'destructive'
      ? {
          bg: 'bg-rose-50 dark:bg-rose-900/20 text-rose-900 dark:text-rose-200 border-rose-300',
          text: 'This action cannot be undone.',
        }
      : {
          bg: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-200 border-cyan-300',
          text: 'This is a Beithady-side change only. No data is sent to Guesty.',
        };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <h3 className="text-sm font-bold flex-1" style={{ color: 'var(--bh-navy)' }}>{title}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div className={`border-l-4 ${banner.bg} p-2 flex items-start gap-2`}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{banner.text}</span>
          </div>
          <p className="text-slate-700 dark:text-slate-300 leading-snug">{description}</p>
          {children}
        </div>
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onCancel} className="ix-btn-secondary !text-xs" disabled={pending}>
            Cancel
          </button>
          <button onClick={onConfirm} className="ix-btn-primary !text-xs" disabled={pending}>
            {pending ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
