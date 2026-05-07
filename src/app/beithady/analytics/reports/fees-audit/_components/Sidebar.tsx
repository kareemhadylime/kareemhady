'use client';

import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Calendar,
  Building2,
  Filter as FilterIcon,
  ToggleLeft,
  Calculator,
  Download,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// How long to keep the sidebar visible after the cursor leaves it before
// auto-collapsing. Long enough to dodge accidental edge-grazes, short enough
// that the operator gets the whole-screen reading area back fast.
const AUTO_COLLAPSE_MS = 2000;
// Tiny delay before opening on hover, so brushing past the icon doesn't
// inadvertently pop the sidebar.
const OPEN_ON_HOVER_MS = 250;
import type {
  FeeAuditConfig,
  FeeCategory,
  BuildingCode,
} from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';
import { FEE_CATEGORY_LABEL } from '@/lib/beithady/fees-audit/types';

const ALL_BUILDINGS: BuildingCode[] = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-DXB', 'OTHER'];
const ALL_CHANNELS: { key: ChannelBucket; label: string }[] = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'booking_com', label: 'Booking' },
  { key: 'other_ota', label: 'Other OTA' },
  { key: 'manual', label: 'Manual' },
];

const GROUPS: Array<{ label: string; items: FeeCategory[]; icon: string }> = [
  { label: 'Nightly Rate', icon: '🛏', items: ['daily_rate', 'weekend_uplift', 'holiday_rate'] },
  { label: 'Stay Fees', icon: '🧹', items: ['cleaning', 'service', 'pet', 'extra_guest', 'security_deposit'] },
  { label: 'Taxes', icon: '🧾', items: ['vat', 'occupancy_tax', 'service_charge', 'total_tax_burden'] },
  { label: 'Channel Cuts', icon: '💳', items: ['channel_commission', 'guest_service_fee'] },
  { label: 'Stay Rules', icon: '📐', items: ['min_stay', 'max_stay', 'lead_time', 'prep_time'] },
  { label: 'Discounts', icon: '🏷', items: ['weekly_discount', 'monthly_discount', 'last_minute_discount'] },
  // Country segmentation — explicit per Q (2026-05-07): EG vs UAE economies
  // are reported separately because Egypt charges in USD via OTAs while
  // UAE collects AED, and the tax/commission stacks differ materially.
  { label: 'Country', icon: '🌐', items: ['country_egypt', 'country_uae', 'country_split'] },
  // Analytic dimensions — orthogonal cross-cuts of the same fee data.
  { label: 'Analytic', icon: '📊', items: ['analytic_bedroom_class', 'analytic_building', 'analytic_channel_mix', 'analytic_capacity'] },
  { label: 'Comparisons', icon: '🔎', items: ['vs_market', 'vs_self', 'vs_peer'] },
];

export function Sidebar({
  open,
  onToggle,
  selected,
  onSelect,
  config,
  onConfigChange,
  onOpenTaxTester,
  onOpenVendorExport,
}: {
  open: boolean;
  onToggle: () => void;
  selected: FeeCategory;
  onSelect: (cat: FeeCategory) => void;
  config: FeeAuditConfig;
  onConfigChange: (c: FeeAuditConfig) => void;
  onOpenTaxTester: () => void;
  onOpenVendorExport: () => void;
}) {
  // Default-collapse Country and Analytic so the sidebar isn't overwhelming
  // on first paint. Operator can expand on demand. Filters group is open
  // by default since it's the primary scope control.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Country: true,
    Analytic: true,
    Comparisons: true,
    Discounts: true,
  });

  // Auto-collapse: when the cursor leaves an open sidebar, wait
  // AUTO_COLLAPSE_MS then collapse it. Re-entering the sidebar (or a child
  // select picker that briefly leaves the bounding box) cancels the timer.
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelCollapseTimer() {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }
  function cancelOpenTimer() {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }
  function scheduleCollapse() {
    cancelCollapseTimer();
    collapseTimer.current = setTimeout(() => {
      onToggle();
    }, AUTO_COLLAPSE_MS);
  }
  function scheduleOpen() {
    cancelOpenTimer();
    openTimer.current = setTimeout(() => {
      onToggle();
    }, OPEN_ON_HOVER_MS);
  }
  useEffect(() => {
    return () => {
      cancelCollapseTimer();
      cancelOpenTimer();
    };
  }, []);

  if (!open) {
    return (
      <button
        onClick={onToggle}
        onMouseEnter={scheduleOpen}
        onMouseLeave={cancelOpenTimer}
        className="ix-card p-2 self-start rounded-lg sticky top-4 transition"
        title="Open sidebar"
        style={{
          background: 'var(--bh-cream)',
          color: 'var(--bh-ink)',
          border: '1px solid var(--bh-mute)',
        }}
      >
        <PanelLeft size={18} />
      </button>
    );
  }

  return (
    <aside
      onMouseEnter={cancelCollapseTimer}
      onMouseLeave={scheduleCollapse}
      className="w-72 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl shadow-sm"
      style={{
        background: 'var(--bh-cream)',
        color: 'var(--bh-ink)',
        border: '1px solid var(--bh-mute)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ borderColor: 'var(--bh-mute)' }}
      >
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{
            color: 'var(--bh-ink)',
            fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
            fontSize: 14,
            letterSpacing: '0.08em',
          }}
        >
          Fee Categories
        </span>
        <button
          onClick={onToggle}
          className="opacity-60 hover:opacity-100 transition"
          style={{ color: 'var(--bh-ink)' }}
          title="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* FILTERS BLOCK — moved here from the top filter bar (2026-05-07).
          Keeps the report area uncluttered and lets all scope controls
          live alongside the fee-category picker. */}
      <div
        className="px-3 py-3 border-b space-y-3"
        style={{ borderColor: 'var(--bh-mute)' }}
      >
        {/* Date + window */}
        <div>
          <div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--bh-steel)', fontWeight: 600 }}
          >
            <Calendar size={11} /> Date · Window
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={config.startDate}
              onChange={e => onConfigChange({ ...config, startDate: e.target.value })}
              className="flex-1 rounded border px-2 py-1 text-xs"
              style={{
                background: 'white',
                borderColor: 'var(--bh-mute)',
                color: 'var(--bh-ink)',
              }}
            />
            <select
              value={config.windowDays}
              onChange={e =>
                onConfigChange({
                  ...config,
                  windowDays: Number(e.target.value) as 7 | 14 | 30,
                })
              }
              className="rounded border px-2 py-1 text-xs"
              style={{
                background: 'white',
                borderColor: 'var(--bh-mute)',
                color: 'var(--bh-ink)',
              }}
            >
              <option value={7}>7d</option>
              <option value={14}>14d</option>
              <option value={30}>30d</option>
            </select>
          </div>
        </div>

        {/* Buildings */}
        <div>
          <div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--bh-steel)', fontWeight: 600 }}
          >
            <Building2 size={11} /> Buildings
            {config.buildings.length > 0 && (
              <button
                onClick={() => onConfigChange({ ...config, buildings: [] })}
                className="ml-auto text-[10px] hover:underline"
                style={{ color: 'var(--bh-gold)' }}
              >
                clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_BUILDINGS.map(b => {
              const active = config.buildings.includes(b);
              return (
                <button
                  key={b}
                  onClick={() =>
                    onConfigChange({
                      ...config,
                      buildings: active
                        ? config.buildings.filter(x => x !== b)
                        : [...config.buildings, b],
                    })
                  }
                  className="px-2 py-0.5 rounded text-[10px] font-semibold transition"
                  style={{
                    background: active ? 'var(--bh-ink)' : 'white',
                    color: active ? 'var(--bh-cream)' : 'var(--bh-ink)',
                    border: active ? '1px solid var(--bh-ink)' : '1px solid var(--bh-mute)',
                  }}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>

        {/* Channels */}
        <div>
          <div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--bh-steel)', fontWeight: 600 }}
          >
            <FilterIcon size={11} /> Channels
            {config.channels.length > 0 && (
              <button
                onClick={() => onConfigChange({ ...config, channels: [] })}
                className="ml-auto text-[10px] hover:underline"
                style={{ color: 'var(--bh-gold)' }}
              >
                clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_CHANNELS.map(c => {
              const active = config.channels.includes(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() =>
                    onConfigChange({
                      ...config,
                      channels: active
                        ? config.channels.filter(x => x !== c.key)
                        : [...config.channels, c.key],
                    })
                  }
                  className="px-2 py-0.5 rounded text-[10px] font-semibold transition"
                  style={{
                    background: active ? 'var(--bh-gold)' : 'white',
                    color: active ? 'var(--bh-ink)' : 'var(--bh-ink)',
                    border: '1px solid ' + (active ? 'var(--bh-gold)' : 'var(--bh-mute)'),
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price mode */}
        <div>
          <div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--bh-steel)', fontWeight: 600 }}
          >
            <ToggleLeft size={11} /> Price Mode
          </div>
          <div className="flex gap-1">
            {(['host_net', 'guest_gross', 'both'] as const).map(m => (
              <button
                key={m}
                onClick={() => onConfigChange({ ...config, priceMode: m })}
                className="flex-1 px-2 py-0.5 rounded text-[10px] font-semibold transition"
                style={{
                  background: config.priceMode === m ? '#15803d' : 'white',
                  color: config.priceMode === m ? 'white' : 'var(--bh-ink)',
                  border: '1px solid ' + (config.priceMode === m ? '#15803d' : 'var(--bh-mute)'),
                }}
              >
                {m === 'host_net' ? 'Host' : m === 'guest_gross' ? 'Guest' : 'Both'}
              </button>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={onOpenTaxTester}
            className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded transition"
            style={{
              background: '#5b3b8a',
              color: 'white',
              border: '1px solid #5b3b8a',
            }}
            title="Tax Stack Tester"
          >
            <Calculator size={11} /> Tax Tester
          </button>
          <button
            onClick={onOpenVendorExport}
            className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded transition"
            style={{
              background: 'white',
              color: 'var(--bh-ink)',
              border: '1px solid var(--bh-mute)',
            }}
            title="Vendor CSV Export"
          >
            <Download size={11} /> Vendor CSV
          </button>
        </div>
      </div>

      <nav className="py-2">
        {GROUPS.map(g => {
          const isCollapsed = collapsed[g.label];
          return (
            <div key={g.label} className="mb-0.5">
              <button
                onClick={() => setCollapsed(s => ({ ...s, [g.label]: !s[g.label] }))}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition hover:bg-white/40"
                style={{ color: 'var(--bh-steel)' }}
              >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="flex-1 text-left">
                  <span className="mr-1.5">{g.icon}</span>
                  {g.label}
                </span>
              </button>
              {!isCollapsed && (
                <ul className="mt-0.5">
                  {g.items.map(cat => {
                    const isSelected = selected === cat;
                    return (
                      <li key={cat}>
                        <button
                          onClick={() => onSelect(cat)}
                          className="w-full text-left flex items-center gap-2 pl-7 pr-3 py-1.5 text-xs transition"
                          style={{
                            background: isSelected ? 'var(--bh-ink)' : 'transparent',
                            color: isSelected ? 'var(--bh-cream)' : 'var(--bh-ink)',
                            fontWeight: isSelected ? 600 : 400,
                            borderLeft: isSelected
                              ? '3px solid var(--bh-gold)'
                              : '3px solid transparent',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected)
                              (e.currentTarget as HTMLElement).style.background =
                                'rgba(212, 169, 58, 0.12)';
                          }}
                          onMouseLeave={e => {
                            if (!isSelected)
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          {FEE_CATEGORY_LABEL[cat]}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
