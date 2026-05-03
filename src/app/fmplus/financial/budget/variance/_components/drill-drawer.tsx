'use client';
import { useEffect, useState } from 'react';
import { loadDrillAction } from '../actions';
import type { DrillResult } from '@/lib/fmplus/budget/variance-drill';

export function DrillDrawer({
  projectId, year, serviceLine, templateVersion, category, month, onClose,
}: {
  projectId: number; year: number; serviceLine: string; templateVersion: number;
  category: string; month: number; onClose: () => void;
}) {
  const [rows, setRows] = useState<DrillResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    loadDrillAction({ projectId, year, serviceLine, templateVersion, category, month })
      .then(res => { if (!alive) return; if (res.ok) setRows(res.rows); else setError(res.error); });
    return () => { alive = false; };
  }, [projectId, year, serviceLine, templateVersion, category, month]);

  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <aside className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl z-50 flex flex-col">
      <header className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{serviceLine.toUpperCase()} · {category} · {new Date(year, month-1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })}</div>
          <div className="text-sm font-semibold">{rows ? `${rows.length} entries · ${new Intl.NumberFormat('en-EG').format(Math.round(total))} EGP` : 'Loading…'}</div>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">✕ Close</button>
      </header>
      <div className="overflow-y-auto flex-1">
        {error && <div className="p-3 text-rose-700 text-sm">{error}</div>}
        {rows && rows.length === 0 && <div className="p-3 text-slate-500 text-sm">No journal entries this month for this category.</div>}
        {rows && rows.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2">Partner</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody className="font-variant-numeric tabular-nums">
              {rows.map(r => (
                <tr key={r.move_line_id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2 whitespace-nowrap">{r.date}</td>
                  <td className="p-2"><div className="text-slate-500">{r.account_code}</div><div>{r.account_name}</div></td>
                  <td className="p-2 text-slate-500">{r.partner_name ?? '—'}</td>
                  <td className="p-2 text-slate-500">{r.description ?? '—'}</td>
                  <td className="p-2 text-right">{new Intl.NumberFormat('en-EG').format(Math.round(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}
