import type { BudgetLine } from '@/lib/fmplus/budget/schema';

interface Props {
  line: BudgetLine;
  canEdit: boolean;
}

export function BudgetLineRow({ line }: Props) {
  const monthly = Number(line.qty) * Number(line.unit_cost);
  const isManning = line.category === 'manning';
  return (
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
        {line.threshold_green != null || line.threshold_amber != null ? (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">override</span>
        ) : (
          <span>global</span>
        )}
      </td>
      <td className="px-2 py-2 text-center text-text-secondary text-xs">
        {isManning && (line.ctc_net != null || line.ctc_relievers != null) ? '▼' : ''}
      </td>
    </tr>
  );
}
