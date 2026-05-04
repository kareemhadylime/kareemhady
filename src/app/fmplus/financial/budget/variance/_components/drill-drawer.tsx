'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';
import type { DrillRow } from '@/lib/fmplus/budget/variance-drill';

interface Props {
  contractId: number;
  yearIndex: number;
  scenario: 'initial' | 'revised' | 'reforecast';
  serviceLine: ServiceLine;
  category: Category;
  month: number;
  onClose: () => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function DrillDrawer({ contractId, yearIndex, scenario, serviceLine, category, month, onClose }: Props) {
  const [rows, setRows] = useState<DrillRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    const params = new URLSearchParams({
      contract: String(contractId),
      year: String(yearIndex),
      scenario,
      service: serviceLine,
      category,
      month: String(month),
    });
    fetch(`/api/fmplus/budget/variance-drill?${params.toString()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { error?: string; rows?: DrillRow[] }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [contractId, yearIndex, scenario, serviceLine, category, month]);

  const total = rows?.reduce((a, r) => a + r.amount, 0) ?? 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <aside className="bg-bg-primary border-l border-border w-full max-w-xl overflow-hidden flex flex-col shadow-2xl">
        <header className="flex items-center justify-between p-4 border-b border-border bg-bg-tertiary">
          <div>
            <strong className="text-sm text-text-primary">{serviceLine.toUpperCase()} · {category} · {MONTHS[month-1]}</strong>
            <div className="text-[11px] text-text-secondary mt-0.5">
              {rows ? `${rows.length} move lines · Total ${total.toLocaleString()} EGP` : 'Loading…'}
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {rows == null && !error && <p className="text-xs text-text-secondary">Loading…</p>}
          {rows && rows.length === 0 && (
            <p className="text-xs text-text-secondary italic">No move lines found for this cell.</p>
          )}
          {rows && rows.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] text-text-secondary uppercase border-b border-border text-left">
                  <th className="px-1 py-1.5">Date</th>
                  <th className="px-1 py-1.5">Account</th>
                  <th className="px-1 py-1.5">Partner / Ref</th>
                  <th className="px-1 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="text-text-primary">
                {rows.map(r => (
                  <tr key={r.move_id} className="border-b border-border hover:bg-bg-tertiary/40">
                    <td className="px-1 py-1.5 text-text-secondary tabular-nums">{r.date}</td>
                    <td className="px-1 py-1.5">
                      <div className="text-[10px] font-mono">{r.account_code ?? '—'}</div>
                      <div className="text-text-secondary text-[10px]">{r.account_name ?? ''}</div>
                    </td>
                    <td className="px-1 py-1.5">
                      <div>{r.partner_name ?? r.ref ?? '—'}</div>
                      <div className="text-text-secondary text-[10px]">{r.journal_name ?? ''}</div>
                    </td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{r.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}
