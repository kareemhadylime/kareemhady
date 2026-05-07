'use client';

import { Calendar, Building2, Filter, ToggleLeft, RefreshCw } from 'lucide-react';
import type { FeeAuditConfig } from '@/lib/beithady/fees-audit/types';
import { FEE_CATEGORY_LABEL } from '@/lib/beithady/fees-audit/types';

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb',
  booking_com: 'Booking',
  other_ota: 'Other OTA',
  manual: 'Manual',
};

const PRICE_MODE_LABEL: Record<string, string> = {
  host_net: 'Host Net',
  guest_gross: 'Guest Gross',
  both: 'Both',
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function endDate(start: string, windowDays: number): string {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + windowDays - 1);
  return fmtDate(d.toISOString().slice(0, 10));
}

/**
 * Dynamic, filter-derived report title.
 *
 * Replaces the static page heading with a live summary like:
 *
 *   "Fee Audit · 7-day forward · Egypt portfolio · Airbnb + Booking · Both prices · 07 May → 13 May"
 *
 * So when the operator changes any filter in the sidebar, the title at the
 * top of the report instantly reflects what's being audited. No more
 * disconnect between filter state and what the user thinks they're looking at.
 */
export function TitleBar({
  config,
  totalUnits,
  loading,
}: {
  config: FeeAuditConfig;
  totalUnits: number | null;
  loading: boolean;
}) {
  const buildingsLabel =
    config.buildings.length === 0
      ? 'All buildings'
      : config.buildings.length <= 3
        ? config.buildings.join(' · ')
        : `${config.buildings.length} buildings`;

  const channelsLabel =
    config.channels.length === 0
      ? 'All channels'
      : config.channels.map(c => CHANNEL_LABEL[c] || c).join(' + ');

  const dateRangeLabel = `${fmtDate(config.startDate)} → ${endDate(config.startDate, config.windowDays)}`;

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
            Booking-Channel Fee Audit
          </p>
          <h2
            className="text-2xl font-bold leading-tight"
            style={{
              color: 'var(--bh-cream)',
              fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {config.windowDays}-day forward · {FEE_CATEGORY_LABEL[config.selectedFeeCategory]}
          </h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs" style={{ color: '#cbd5e1' }}>
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} style={{ color: 'var(--bh-gold)' }} /> {dateRangeLabel}
            </span>
            <span style={{ color: 'var(--bh-mute)' }}>·</span>
            <span className="inline-flex items-center gap-1">
              <Building2 size={12} style={{ color: 'var(--bh-gold)' }} /> {buildingsLabel}
            </span>
            <span style={{ color: 'var(--bh-mute)' }}>·</span>
            <span className="inline-flex items-center gap-1">
              <Filter size={12} style={{ color: 'var(--bh-gold)' }} /> {channelsLabel}
            </span>
            <span style={{ color: 'var(--bh-mute)' }}>·</span>
            <span className="inline-flex items-center gap-1">
              <ToggleLeft size={12} style={{ color: 'var(--bh-gold)' }} /> {PRICE_MODE_LABEL[config.priceMode]}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {loading && (
            <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--bh-gold)' }} />
          )}
          {totalUnits != null && (
            <div className="text-right">
              <div
                className="text-3xl font-bold"
                style={{
                  color: 'var(--bh-gold)',
                  fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
                }}
              >
                {totalUnits}
              </div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
                units in scope
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
