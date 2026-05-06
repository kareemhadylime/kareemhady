const COLOR_CLASSES: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400',
  amber: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red:   'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400',
};

interface Row {
  contract_id: number;
  contract_name: string;
  customer: string | null;
  year_label: string;
  categoryByCode: Record<string, { variance_pct: number | null; color: 'green'|'amber'|'red' }>;
  overall_variance_pct: number | null;
}

interface Props {
  mode: 'projects' | 'yoy';
  rows: Row[];
  categories: string[];
  serviceLine: string;
}

export function CompareGrid({ mode, rows, categories }: Props) {
  const fmtPct = (p: number | null) => p == null ? '—' : `${(p * 100).toFixed(1)}%`;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400 uppercase">
              <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 min-w-[200px]">
                {mode === 'projects' ? 'Contract' : 'Category'}
              </th>
              {categories.map(c => (
                <th key={c} className="px-2 py-2 text-right tabular-nums min-w-[80px]">{c}</th>
              ))}
              {mode === 'projects' && (
                <th className="px-3 py-2 text-right min-w-[80px]">Overall</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={mode === 'projects' ? row.contract_id : row.contract_name} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/40">
                <td className="px-3 py-2 sticky left-0 bg-white dark:bg-slate-900 z-10">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{row.contract_name}</div>
                  {row.customer && <div className="text-[10px] text-slate-500 dark:text-slate-400">{row.customer}</div>}
                  {row.year_label && <div className="text-[10px] text-slate-500 dark:text-slate-400">{row.year_label}</div>}
                </td>
                {categories.map(cat => {
                  const cell = row.categoryByCode[cat];
                  return (
                    <td key={cat} className={`px-2 py-2 text-right tabular-nums ${cell ? COLOR_CLASSES[cell.color] : 'text-slate-500 dark:text-slate-400'}`}>
                      {cell ? fmtPct(cell.variance_pct) : '—'}
                    </td>
                  );
                })}
                {mode === 'projects' && (
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmtPct(row.overall_variance_pct)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
