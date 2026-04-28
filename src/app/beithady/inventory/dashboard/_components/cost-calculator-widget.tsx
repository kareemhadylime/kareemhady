'use client';

import { useState, useTransition } from 'react';
import { Calculator, AlertCircle } from 'lucide-react';
import { computeCostSampleAction } from '../actions';
import type { CostSample } from '@/lib/beithady/inventory/rules-shared';

const SAMPLE_BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34', 'OTHER'];

export function CostCalculatorWidget() {
  const [pending, startTransition] = useTransition();
  const [guests, setGuests] = useState(2);
  const [nights, setNights] = useState(5);
  const [buildingCode, setBuildingCode] = useState<string>('BH-26');
  const [result, setResult] = useState<CostSample | null>(null);
  const [error, setError] = useState<string | null>(null);

  function compute() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await computeCostSampleAction(guests, nights, buildingCode || null);
      if ('error' in res) setError(res.error);
      else setResult(res);
    });
  }

  return (
    <div className="ix-card p-4 space-y-3 text-xs">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <Field label="Guests">
          <input type="number" min="1" max="50" value={guests} onChange={e => setGuests(parseInt(e.target.value, 10) || 1)} className="ix-input w-full text-right" />
        </Field>
        <Field label="Nights">
          <input type="number" min="1" max="60" value={nights} onChange={e => setNights(parseInt(e.target.value, 10) || 1)} className="ix-input w-full text-right" />
        </Field>
        <Field label="Building">
          <select value={buildingCode} onChange={e => setBuildingCode(e.target.value)} className="ix-input w-full">
            <option value="">All (global only)</option>
            {SAMPLE_BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2 flex items-end gap-2">
          <button type="button" onClick={compute} disabled={pending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-700 inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50">
            <Calculator size={14} /> {pending ? 'Calculating…' : 'Calculate'}
          </button>
          {result && (
            <div className="text-right ml-auto">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Total</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
                {result.total_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                <span className="text-xs text-slate-500 ml-1">EGP</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 inline-flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}

      {result && (
        result.lines.length === 0 ? (
          <div className="ix-card border-amber-200 bg-amber-50 p-3 text-amber-800 text-[11px]">
            <AlertCircle size={12} className="inline mr-1" />
            No consumption rules apply to this scenario. Add rules at <a href="/beithady/inventory/rules" className="underline font-medium">Consumption rules</a>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-2 py-1.5">Item</th>
                  <th className="text-left px-2 py-1.5">Rule scope</th>
                  <th className="text-right px-2 py-1.5">Qty</th>
                  <th className="text-right px-2 py-1.5">Unit cost (EGP)</th>
                  <th className="text-right px-2 py-1.5">Line cost</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map(l => (
                  <tr key={l.item_id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[10px]">{l.item_sku}</div>
                      <div className="text-[10px] text-slate-500">{l.item_name_en}</div>
                    </td>
                    <td className="px-2 py-1.5 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">{l.rule_scope}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{l.unit_cost_egp.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{l.line_cost_egp.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={4} className="px-2 py-1.5 text-right font-medium text-slate-700">
                    Per-checkin total ({guests} guests × {nights} nights{buildingCode ? ` · ${buildingCode}` : ''})
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold">
                    {result.total_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}
