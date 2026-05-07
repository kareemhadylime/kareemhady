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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="ix-card p-2 self-start rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 sticky top-4"
        title="Open sidebar"
      >
        <PanelLeft size={18} />
      </button>
    );
  }

  return (
    <aside className="ix-card w-72 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-bold uppercase tracking-wide text-[#1e3a5f] dark:text-amber-100">
          Fee Categories
        </span>
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-slate-700"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <nav className="py-2">
        {GROUPS.map(g => {
          const isCollapsed = collapsed[g.label];
          return (
            <div key={g.label} className="mb-1">
              <button
                onClick={() => setCollapsed(s => ({ ...s, [g.label]: !s[g.label] }))}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="flex-1 text-left">
                  <span className="mr-1">{g.icon}</span>
                  {g.label}
                </span>
              </button>
              {!isCollapsed && (
                <ul className="mt-0.5">
                  {g.items.map(cat => (
                    <li key={cat}>
                      <button
                        onClick={() => onSelect(cat)}
                        className={`w-full flex items-center gap-2 px-6 py-1.5 text-xs transition ${
                          selected === cat
                            ? 'bg-[#1e3a5f] text-white font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {FEE_CATEGORY_LABEL[cat]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
