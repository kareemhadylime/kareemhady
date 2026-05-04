'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { BudgetLine } from '@/lib/fmplus/budget/schema';
import { CtcExpand } from './ctc-expand';

interface Props {
  line: BudgetLine;
  canEdit: boolean;
}

export function BudgetLineRow({ line, canEdit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const monthly = Number(line.qty) * Number(line.unit_cost);
  const isManning = line.category === 'manning';
  const hasCtc = line.ctc_net != null || line.ctc_relievers != null || line.ctc_ot != null
    || line.ctc_training != null || line.ctc_insurance != null || line.ctc_medical != null;
  const hasThresholdOverride = line.threshold_green != null || line.threshold_amber != null;

  return (
    <>
      <tr className="border-b border-border hover:bg-bg-tertiary/40">
        <td className="px-2 py-2 text-xs">
          <div className="font-medium text-text-primary">{line.label_en}</div>
          {line.label_ar && (
            <div className="text-[10px] text-text-secondary">{line.label_ar}</div>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-xs">
          {Number(line.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-xs">
          {Number(line.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-xs font-semibold">
          {monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </td>
        <td className="px-2 py-2 text-center text-[10px] text-text-secondary">
          {hasThresholdOverride ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">override</span>
          ) : (
            <span>global</span>
          )}
        </td>
        <td className="px-2 py-2 text-center">
          {isManning ? (
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="text-text-secondary hover:text-accent"
              title={expanded ? 'Collapse CTC breakdown' : 'Expand CTC breakdown'}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {hasCtc && !expanded && <span className="ml-1 text-[8px] text-accent">CTC</span>}
            </button>
          ) : ''}
        </td>
      </tr>
      {expanded && isManning && (
        <CtcExpand line={line} canEdit={canEdit} />
      )}
    </>
  );
}
