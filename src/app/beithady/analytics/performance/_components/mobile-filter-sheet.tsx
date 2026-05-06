'use client';
import { useEffect } from 'react';
import { LeftRail } from './left-rail';
import type { PerfUrlState } from '../_hooks/use-url-state';

type Props = {
  open: boolean;
  onClose: () => void;
  state: PerfUrlState;
  onChange: (patch: Partial<PerfUrlState>) => void;
};

export function MobileFilterSheet({ open, onClose, state, onChange }: Props) {
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
        className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-[#003462]/15 bg-white p-5 text-[#003462] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#003462]/15" aria-hidden="true" />
        <h2 className="mb-3 text-lg font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>Filters</h2>
        <LeftRail state={state} onChange={onChange} />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-[#003462] bg-[#003462] px-3 py-2 text-sm font-medium text-white hover:bg-[#003462]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
        >
          Done
        </button>
      </div>
    </div>
  );
}
