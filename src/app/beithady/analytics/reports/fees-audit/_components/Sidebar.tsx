'use client';

import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useState } from 'react';
import type { FeeCategory } from '@/lib/beithady/fees-audit/types';
import { FEE_CATEGORY_LABEL } from '@/lib/beithady/fees-audit/types';

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
}: {
  open: boolean;
  onToggle: () => void;
  selected: FeeCategory;
  onSelect: (cat: FeeCategory) => void;
}) {
  // Default-collapse Country and Analytic so the sidebar isn't overwhelming
  // on first paint. Operator can expand on demand.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Country: true,
    Analytic: true,
    Comparisons: true,
  });

  if (!open) {
    return (
      <button
        onClick={onToggle}
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
