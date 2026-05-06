'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  /** Tiny label shown above the panel content (e.g. "Occupancy" or "Channel mix"). */
  label: string;
  /** Optional drill-down URL — when provided, the entire panel becomes a clickable Link. */
  drillTo?: string;
  /** Show the green "live" pulse next to the label. */
  liveBadge?: boolean;
  /** Extra classes appended to the panel root (e.g. for a navy-edge accent). */
  className?: string;
  children: ReactNode;
  /** Hide handler — when supplied, a hover-only × close button is rendered top-right. */
  onHide?: () => void;
};

/**
 * Card chrome shared by every panel on the Performance Dashboard. White
 * surface, navy-tinted border, brand-locked label color, optional clickable
 * drill-down, optional hover-only hide button. No off-brand colors.
 */
export function PanelFrame({ label, drillTo, liveBadge, className = '', children, onHide }: Props) {
  const inner = (
    <div className={`group relative rounded-lg border border-[#003462]/10 bg-white p-4 sm:p-5 shadow-sm ${className}`}>
      {onHide && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
          className="absolute right-2 top-2 text-[11px] text-[#003462]/30 opacity-0 transition motion-reduce:transition-none group-hover:opacity-100 hover:text-[#003462]/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 rounded"
          aria-label={`Hide ${label}`}
        >
          ×
        </button>
      )}
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6077a6]/80">
        <span>{label}</span>
        {liveBadge && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="live" />}
      </div>
      {children}
    </div>
  );
  return drillTo ? (
    <Link
      href={drillTo}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
      aria-label={`${label} — drill into details`}
    >
      {inner}
    </Link>
  ) : inner;
}
