'use client';

import { useState } from 'react';
import type { ServiceSegment, VarianceColor } from '@/lib/fmplus/budget/variance';
import type { Bilingual } from '@/lib/fmplus/budget/types';
import { DrillDrawer } from './drill-drawer';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const COLOR_CLASSES: Record<VarianceColor, string> = {
  green: 'bg-green-500/10 text-green-400',
  amber: 'bg-amber-500/15 text-amber-400',
  red:   'bg-red-500/15 text-red-400',
};

interface Props {
  segment: ServiceSegment;
  contractId: number;
  yearIndex: number;
  scenario: string;
  bilingual: Bilingual;
}

export function VarianceGrid({ segment, contractId, yearIndex, scenario, bilingual }: Props) {
  const [drill, setDrill] = useState<{ category: string; month: number } | null>(null);

  const fmt = (n: number) => n === 0 ? '—' : Math.round(n).toLocaleString();

  return (
    <div className="bg-bg-tertiary border border-border rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-border bg-bg-secondary flex justify-between items-center flex-wrap gap-2">
        <strong className="text-sm text-text-primary uppercase">{segment.service_line}</strong>
        <span className="text-[11px] text-text-secondary tabular-nums">
          Budget: <strong>{(segment.segment_budget / 1_000_000).toFixed(2)} M</strong>
          {' · '}
          Actual: <strong>{(segment.segment_actual / 1_000_000).toFixed(2)} M</strong>
          {' · '}
          Var: <strong className={
            segment.segment_variance_pct == null ? '' :
            Math.abs(segment.segment_variance_pct * 100) <= 5 ? 'text-green-400' :
            (segment.segment_variance_pct * 100) > 15 ? 'text-red-400' : 'text-amber-400'
          }>
            {segment.segment_variance_pct != null ? `${(segment.segment_variance_pct * 100).toFixed(1)}%` : '—'}
          </strong>
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-bg-secondary border-b border-border text-[10px] text-text-secondary uppercase">
              <th className="px-2 py-1.5 text-left sticky left-0 bg-bg-secondary z-10 min-w-[140px]">Category</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-1.5 py-1.5 text-right tabular-nums min-w-[60px]">{m}</th>
              ))}
              <th className="px-2 py-1.5 text-right tabular-nums min-w-[80px]">YTD</th>
              <th className="px-2 py-1.5 text-right tabular-nums min-w-[60px]">Var %</th>
            </tr>
          </thead>
          <tbody>
            {segment.categories.map(cat => (
              <tr key={cat.category} className="border-b border-border hover:bg-bg-tertiary/30">
                <td className="px-2 py-1.5 sticky left-0 bg-bg-tertiary font-medium text-text-primary z-10">
                  {bilingual === 'ar' && cat.label_ar ? cat.label_ar : cat.label_en}
                </td>
                {cat.cells.map(cell => (
                  <td key={cell.month}
                    onClick={() => cell.actual !== 0 && setDrill({ category: cat.category, month: cell.month })}
                    className={`px-1.5 py-1.5 text-right tabular-nums cursor-pointer ${COLOR_CLASSES[cell.color]}`}
                    title={`Budget: ${cell.budget.toLocaleString()} | Actual: ${cell.actual.toLocaleString()} | Var: ${cell.variance.toLocaleString()}`}>
                    {fmt(cell.actual)}
                  </td>
                ))}
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${COLOR_CLASSES[cat.ytd_color]}`}>
                  {fmt(cat.ytd_actual)}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${COLOR_CLASSES[cat.ytd_color]}`}>
                  {cat.ytd_variance_pct != null ? `${(cat.ytd_variance_pct * 100).toFixed(0)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drill && (
        <DrillDrawer
          contractId={contractId}
          yearIndex={yearIndex}
          scenario={scenario as 'initial' | 'revised' | 'reforecast'}
          serviceLine={segment.service_line}
          category={drill.category as import('@/lib/fmplus/budget/types').Category}
          month={drill.month}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
