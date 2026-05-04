'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { BudgetLine } from '@/lib/fmplus/budget/schema';
import { CtcExpand } from './ctc-expand';
import { updateLineQtyCostAction, deleteLineAction } from '../actions';

interface Props {
  line: BudgetLine;
  canEdit: boolean;
}

export function BudgetLineRow({ line, canEdit }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialQty = Number(line.qty);
  const initialUnitCost = Number(line.unit_cost);
  const [qty, setQty] = useState(initialQty);
  const [unitCost, setUnitCost] = useState(initialUnitCost);

  const monthly = qty * unitCost;
  const isManning = line.category === 'manning';
  const hasCtc = line.ctc_net != null || line.ctc_relievers != null || line.ctc_ot != null
    || line.ctc_training != null || line.ctc_insurance != null || line.ctc_medical != null;
  const hasThresholdOverride = line.threshold_green != null || line.threshold_amber != null;

  const persistIfChanged = () => {
    if (!canEdit || !line.id) return;
    if (qty === initialQty && unitCost === initialUnitCost) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateLineQtyCostAction({
          line_id: line.id,
          qty,
          unit_cost: unitCost,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onDelete = () => {
    if (!canEdit || !line.id) return;
    if (!confirm(`Delete "${line.label_en}"? This cannot be undone (until you Save Draft and refresh).`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteLineAction(line.id!);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  // For manning lines with CTC set, qty is editable but unit_cost is computed — disable the unit_cost input
  const unitCostReadOnly = isManning && hasCtc;

  return (
    <>
      <tr className="border-b border-border hover:bg-bg-tertiary/40">
        <td className="px-2 py-2 text-xs">
          <div className="font-medium text-text-primary">{line.label_en}</div>
          {line.label_ar && (
            <div className="text-[10px] text-text-secondary">{line.label_ar}</div>
          )}
        </td>
        <td className="px-2 py-2 text-right">
          {canEdit ? (
            <input type="number" min="0" step="0.01" value={qty}
              onChange={e => setQty(Number(e.currentTarget.value) || 0)}
              onBlur={persistIfChanged}
              disabled={isPending}
              className="w-16 px-1 py-0.5 text-right text-xs bg-bg-secondary border border-border rounded tabular-nums disabled:opacity-50" />
          ) : (
            <span className="tabular-nums text-xs">{Number(line.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          )}
        </td>
        <td className="px-2 py-2 text-right">
          {canEdit && !unitCostReadOnly ? (
            <input type="number" min="0" step="0.01" value={unitCost}
              onChange={e => setUnitCost(Number(e.currentTarget.value) || 0)}
              onBlur={persistIfChanged}
              disabled={isPending}
              className="w-24 px-1 py-0.5 text-right text-xs bg-bg-secondary border border-border rounded tabular-nums disabled:opacity-50" />
          ) : (
            <span className="tabular-nums text-xs">{Number(line.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          )}
          {unitCostReadOnly && (
            <span className="ml-1 text-[9px] text-text-secondary" title="Computed from CTC components">CTC</span>
          )}
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
          <div className="flex items-center justify-end gap-1">
            {isManning && (
              <button type="button" onClick={() => setExpanded(v => !v)}
                className="text-text-secondary hover:text-accent"
                title={expanded ? 'Collapse CTC breakdown' : 'Expand CTC breakdown'}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {hasCtc && !expanded && <span className="ml-0.5 text-[8px] text-accent">CTC</span>}
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={onDelete} disabled={isPending}
                className="text-text-secondary hover:text-red-500 disabled:opacity-50"
                title="Delete line">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {error && (
        <tr><td colSpan={6} className="px-2 py-1 text-[11px] text-red-400">{error}</td></tr>
      )}
      {expanded && isManning && (
        <CtcExpand line={line} canEdit={canEdit} />
      )}
    </>
  );
}
