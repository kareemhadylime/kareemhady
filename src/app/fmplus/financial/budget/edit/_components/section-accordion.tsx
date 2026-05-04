'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import type { Template } from '@/lib/fmplus/budget/schema';
import type { BudgetLine } from '@/lib/fmplus/budget/schema';
import { BudgetLineRow } from './budget-line-row';

interface Props {
  template: Template;
  lines: BudgetLine[];
  canEdit: boolean;
  openSection?: string;
  contractId: number;
  yearId: number;
  yearIndex: number;
  serviceLine: string;
}

export function SectionAccordion({ template, lines, canEdit, openSection }: Props) {
  // Open by default: 'manning' (the most-edited section), or the section in URL
  const initialOpen = new Set<string>([openSection || 'manning']);
  const [opened, setOpened] = useState(initialOpen);

  const toggle = (code: string) => {
    setOpened(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {template.categories.map(cat => {
        const catLines = lines.filter(l => l.category === cat.code);
        const isOpen = opened.has(cat.code);
        const totalMonthly = catLines.reduce(
          (a, l) => a + Number(l.qty) * Number(l.unit_cost), 0
        );
        const annual = totalMonthly * 12;
        const isGovernmental = cat.code === 'governmental';

        return (
          <div key={cat.code}
            className={`bg-bg-tertiary border rounded-lg ${isGovernmental ? 'border-amber-500/30' : 'border-border'}`}>
            <button type="button" onClick={() => toggle(cat.code)}
              className="w-full px-4 py-3 flex justify-between items-center cursor-pointer text-left">
              <div>
                <span className="text-sm font-semibold text-text-primary">
                  {isOpen ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
                  {' '}{cat.label_en}
                  {cat.label_ar && <span className="text-text-secondary text-[11px] font-normal ml-2">{cat.label_ar}</span>}
                </span>
                <span className="text-[11px] text-text-secondary ml-3">
                  {catLines.length} line{catLines.length === 1 ? '' : 's'}
                  {annual > 0 && ` · ${(annual / 1_000_000).toFixed(2)} M EGP/year`}
                </span>
                {isGovernmental && (
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">NEW in v2</span>
                )}
              </div>
              {canEdit && (
                <span
                  className="text-[10px] px-2 py-1 bg-blue-500/15 text-accent border border-accent/40 rounded inline-flex items-center gap-1 opacity-50 cursor-not-allowed"
                  title="Add line picker ships in Task 22">
                  <Plus size={10} /> Add line
                </span>
              )}
            </button>

            {isOpen && (
              <div className="px-4 pb-3">
                {catLines.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-text-secondary italic border-t border-border">
                    No lines yet. Use &quot;+ Add line&quot; to populate from the catalog or as free-text.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-t border-border">
                      <thead>
                        <tr className="text-[10px] text-text-secondary uppercase border-b border-border">
                          <th className="px-2 py-2 text-left">Line</th>
                          <th className="px-2 py-2 text-right w-20">Qty / HC</th>
                          <th className="px-2 py-2 text-right w-28">Unit / mo</th>
                          <th className="px-2 py-2 text-right w-28">Monthly</th>
                          <th className="px-2 py-2 text-center w-24">Threshold</th>
                          <th className="px-2 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {catLines.map(l => (
                          <BudgetLineRow key={l.id ?? l.line_code} line={l} canEdit={canEdit} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
