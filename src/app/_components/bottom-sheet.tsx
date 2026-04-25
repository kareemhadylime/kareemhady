'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Slide-up panel for mobile-style bottom sheets. Renders as a regular
// centered modal on ≥sm. Backdrop tap, ESC, and the close button
// dismiss it. Body scroll-locked while open.

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  // Optional sticky footer (action buttons)
  footer?: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ESC + body scroll lock.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700
                   rounded-t-2xl sm:rounded-2xl shadow-xl
                   max-h-[85vh] flex flex-col
                   safe-pb"
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <span className="block w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        {(title || true) && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-base">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">{children}</div>

        {footer && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 sm:px-6 py-3 bg-slate-50/50 dark:bg-slate-950/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
