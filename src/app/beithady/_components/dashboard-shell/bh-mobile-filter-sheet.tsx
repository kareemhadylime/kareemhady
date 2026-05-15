'use client';
// Note: hex literal #003462/40 inherited from the original mobile-filter-sheet.tsx
// for DOM preservation. Brand-var migration in audit §7.2 sweep.
import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

// Bottom sheet wrapper for mobile filter UI. ESC + backdrop both close it.
// Locks body scroll while open. Renders nothing when closed.
export function BHMobileFilterSheet({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-[#003462]/40" />
      <div
        className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl p-5 shadow-2xl"
        style={{ background: 'var(--bh-cream)', color: 'var(--bh-ink)', borderTop: '1px solid var(--bh-mute)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--bh-mute)' }} aria-hidden="true" />
        <h2 className="mb-3 text-lg font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>Filters</h2>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ background: 'var(--bh-ink)', color: 'var(--bh-cream)' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
