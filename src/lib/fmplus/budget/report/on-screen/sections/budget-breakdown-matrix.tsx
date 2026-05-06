import type { ReportData } from '../../types';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

function fmtEGP(n: number) {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}

const SL_LABELS: Record<string, string> = {
  hk: 'HK', mep: 'MEP', landscape: 'LS', security: 'SEC',
  pest_ctrl: 'PEST', waste_mgmt: 'WASTE', back_office: 'BO',
};

const CAT_LABELS: Record<string, string> = {
  manning: 'Manning', ppe: 'PPE', tools: 'Tools', consumables: 'Consumables',
  transport: 'Transport', it: 'IT', governmental: 'Governmental', other: 'Other',
};

const ALL_CATEGORIES: Category[] = ['manning', 'ppe', 'tools', 'consumables', 'transport', 'it', 'governmental', 'other'];

export function BudgetBreakdownMatrix({ data }: { data: ReportData }) {
  // HIDDEN in customer mode (cells will be null)
  if (data.budget_breakdown.cells === null) return null;

  const cells = data.budget_breakdown.cells;
  const services = [...new Set(cells.map(c => c.service_line))] as ServiceLine[];
  const usedCategories = ALL_CATEGORIES.filter(cat => cells.some(c => c.category === cat));

  function getCell(cat: Category, sl: ServiceLine) {
    return cells.find(c => c.category === cat && c.service_line === sl)?.monthly ?? 0;
  }

  function rowTotal(cat: Category) {
    return services.reduce((sum, sl) => sum + getCell(cat, sl), 0);
  }

  function colTotal(sl: ServiceLine) {
    return usedCategories.reduce((sum, cat) => sum + getCell(cat, sl), 0);
  }

  const grandTotal = services.reduce((sum, sl) => sum + colTotal(sl), 0);

  return (
    <section className="ix-card p-5 space-y-3">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Budget Breakdown Matrix</h2>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">Monthly cost by category × service line (EGP)</p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
              <th className="pb-2 pr-3">Category</th>
              {services.map(sl => (
                <th key={sl} className="pb-2 pr-2 text-right">{SL_LABELS[sl] ?? sl}</th>
              ))}
              <th className="pb-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {usedCategories.map(cat => {
              const rTotal = rowTotal(cat);
              return (
                <tr key={cat} className="text-slate-900 dark:text-slate-100">
                  <td className="py-1.5 pr-3 font-medium">{CAT_LABELS[cat] ?? cat}</td>
                  {services.map(sl => {
                    const val = getCell(cat, sl);
                    return (
                      <td key={sl} className="py-1.5 pr-2 text-right tabular-nums">
                        {val > 0 ? fmtEGP(val) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right tabular-nums font-semibold">{fmtEGP(rTotal)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
              <td className="pt-2 pr-3 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</td>
              {services.map(sl => (
                <td key={sl} className="pt-2 pr-2 text-right tabular-nums">{fmtEGP(colTotal(sl))}</td>
              ))}
              <td className="pt-2 text-right tabular-nums text-fmplus-gold dark:text-fmplus-yellow">{fmtEGP(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
