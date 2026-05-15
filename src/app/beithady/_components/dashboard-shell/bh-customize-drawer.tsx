'use client';
import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

// Right-side overlay drawer. ESC + backdrop both close it. Locks body scroll
// while open. Content is fully consumer-owned — this is just a chrome shell.
// Perf dashboard uses it for panel-visibility toggles; other pages can use it
// for any customization UI.
export function BHCustomizeDrawer({ open, onClose, title = 'Customize', footer, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-[#003462]/40" />
      <aside
        className="absolute right-0 top-0 flex h-full w-96 flex-col shadow-xl"
        style={{ background: 'var(--bh-cream)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--bh-mute)' }}
        >
          <h2
            className="text-lg font-semibold text-[#003462]"
            style={{ fontFamily: 'var(--bh-heading)' }}
          >
            ⚙ {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded text-[#6077a6] hover:text-[#003462] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
            aria-label="Close customize drawer"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <footer
            className="px-6 py-3 flex justify-between"
            style={{ borderTop: '1px solid var(--bh-mute)' }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
