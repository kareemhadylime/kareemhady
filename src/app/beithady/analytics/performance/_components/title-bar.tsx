'use client';
import { Calendar, Building2, ArrowLeftRight, Settings } from 'lucide-react';
import type { PerfUrlState } from '../_hooks/use-url-state';
import Link from 'next/link';

const COMPARE_LABEL: Record<string, string> = {
  'yesterday': 'vs Yesterday',
  'last-week': 'vs Last Week',
  'last-month': 'vs Last Month',
  'last-year': 'vs Last Year',
  'none': 'No comparison',
};

const BUILDING_LABEL: Record<string, string> = {
  'all': 'All buildings',
  'BH-26': 'BH-26',
  'BH-73': 'BH-73',
  'BH-435': 'BH-435',
  'BH-OK': 'BH-OK',
  'OTHER': 'Other',
};

type Props = {
  state: PerfUrlState;
  generatedAt: string;
  reportDate: string;
  hiddenCount: number;
  currentDate: string;
  onCustomizeClick: () => void;
  onDateChange: (date: string) => void;
  onFilterClick?: () => void;
};

export function TitleBar({ state, generatedAt, reportDate, hiddenCount, currentDate, onCustomizeClick, onFilterClick }: Props) {
  const cairoTime = new Date(generatedAt).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit',
  });
  const dateLabel = new Date(reportDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

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
          <p
            className="text-[10px] uppercase tracking-[0.18em] mb-1"
            style={{ color: 'var(--bh-gold)' }}
          >
            Performance Dashboard
          </p>
          <h2
            className="text-2xl font-bold leading-tight"
            style={{
              color: 'var(--bh-cream)',
              fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {dateLabel} · Snapshot
          </h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs" style={{ color: '#cbd5e1' }}>
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} style={{ color: 'var(--bh-gold)' }} /> Data as of {cairoTime} Cairo
            </span>
            <span style={{ color: 'var(--bh-mute)' }}>·</span>
            <span className="inline-flex items-center gap-1">
              <Building2 size={12} style={{ color: 'var(--bh-gold)' }} /> {BUILDING_LABEL[state.building] ?? state.building}
            </span>
            <span style={{ color: 'var(--bh-mute)' }}>·</span>
            <span className="inline-flex items-center gap-1">
              <ArrowLeftRight size={12} style={{ color: 'var(--bh-gold)' }} /> {COMPARE_LABEL[state.compare] ?? state.compare}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onFilterClick && (
            <button
              type="button"
              onClick={onFilterClick}
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
          <Link
            href={`/api/beithady/perf/export-pdf${currentDate ? `?date=${currentDate}` : ''}`}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              background: 'transparent',
              color: 'var(--bh-gold)',
              borderColor: 'var(--bh-gold)',
            }}
            aria-label="Export current snapshot as PDF"
          >
            ⤓ Export PDF
          </Link>
          <button
            type="button"
            onClick={onCustomizeClick}
            className="rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              background: 'var(--bh-gold)',
              color: 'var(--bh-ink)',
            }}
          >
            <Settings size={11} className="inline mr-1" />
            Customize{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
