'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

type Accent = 'ink' | 'gold' | 'steel' | 'green' | 'amber' | 'red';
const ACCENT_COLOR: Record<Accent, string> = {
  ink: 'var(--bh-ink)',
  gold: 'var(--bh-gold)',
  steel: 'var(--bh-steel)',
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
};

type Props = {
  /** Tiny label shown above the panel content (e.g. "Occupancy" or "Channel mix"). */
  label: string;
  /** Optional drill-down URL — when provided, the entire panel becomes a clickable Link. */
  drillTo?: string;
  /** Show the green "live" pulse next to the label. */
  liveBadge?: boolean;
  /** Extra classes appended to the panel root. */
  className?: string;
  children: ReactNode;
  /** Hide handler — when supplied, a hover-only × close button is rendered top-right. */
  onHide?: () => void;
  /** Color of the 4px left edge accent. Default: 'ink'. */
  accent?: Accent;
};

/**
 * Card chrome shared by every panel on the Performance Dashboard.
 * Cream surface, 1px mute border, 4px colored left edge (accent prop),
 * brand-locked label color, optional clickable drill-down, optional
 * hover-only hide button.
 */
export function PanelFrame({ label, drillTo, liveBadge, className = '', children, onHide, accent = 'ink' }: Props) {
  const accentColor = ACCENT_COLOR[accent];
  const inner = (
    <div
      className={`group relative rounded-lg p-4 sm:p-5 shadow-sm ${className}`}
      style={{
        background: 'var(--bh-cream)',
        border: '1px solid var(--bh-mute)',
        borderLeft: `4px solid ${accentColor}`,
      }}
    >
      {onHide && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
          className="absolute right-2 top-2 text-[11px] opacity-0 transition motion-reduce:transition-none group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded"
          style={{ color: 'var(--bh-steel)' }}
          aria-label={`Hide ${label}`}
        >
          ×
        </button>
      )}
      <div
        className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--bh-steel)', fontWeight: 600, letterSpacing: '0.08em' }}
      >
        <span>{label}</span>
        {liveBadge && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="live" />}
      </div>
      {children}
    </div>
  );
  return drillTo ? (
    <Link
      href={drillTo}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ outlineColor: 'var(--bh-gold)' }}
      aria-label={`${label} — drill into details`}
    >
      {inner}
    </Link>
  ) : inner;
}
