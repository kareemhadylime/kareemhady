'use client';
import type { LucideIcon } from 'lucide-react';

export type BHTitleBarChip = {
  icon: LucideIcon;
  label: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  chips?: BHTitleBarChip[];
  actions?: React.ReactNode;
  onMobileFilterClick?: () => void;
};

// Navy-gradient header for BH data dashboards. Eyebrow / title / subtitle /
// chips are all standardized; page-specific buttons (Export, Customize,
// Manual Rebuild, etc.) go in the `actions` slot. The mobile filter button
// (☰ Filters) shows on mobile only when `onMobileFilterClick` is provided.
export function BHTitleBar({
  eyebrow,
  title,
  subtitle,
  chips,
  actions,
  onMobileFilterClick,
}: Props) {
  return (
    <div
      className="rounded-xl px-5 py-4 shadow-sm"
      style={{
        background: 'linear-gradient(135deg, var(--bh-ink) 0%, #2c4d7a 100%)',
        border: '1px solid var(--bh-mute)',
      }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <p
              className="text-[10px] uppercase tracking-[0.18em] mb-1"
              style={{ color: 'var(--bh-gold)' }}
            >
              {eyebrow}
            </p>
          )}
          <h2
            className="text-2xl font-bold leading-tight"
            style={{
              color: 'var(--bh-cream)',
              fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-xs" style={{ color: '#cbd5e1' }}>
              {subtitle}
            </p>
          )}
          {chips && chips.length > 0 && (
            <div
              className="flex items-center gap-3 mt-2 flex-wrap text-xs"
              style={{ color: '#cbd5e1' }}
            >
              {chips.map((chip, i) => {
                const Icon = chip.icon;
                return (
                  <span key={i} className="contents">
                    {i > 0 && <span style={{ color: 'var(--bh-mute)' }}>·</span>}
                    <span className="inline-flex items-center gap-1">
                      <Icon size={12} style={{ color: 'var(--bh-gold)' }} />
                      {chip.label}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onMobileFilterClick && (
            <button
              type="button"
              onClick={onMobileFilterClick}
              className="md:hidden rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: 'transparent',
                color: 'var(--bh-gold)',
                borderColor: 'var(--bh-gold)',
              }}
              aria-label="Open filters"
            >
              ☰ Filters
            </button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
