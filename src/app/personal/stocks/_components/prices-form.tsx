'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  instrumentId: number; ticker: string; name: string;
  qtyHeld: number; avgCost: number;
  lastPrice: number | null; lastAsOf: string | null;
};

export function PricesForm({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [edits, setEdits] = useState<Record<number, { price: string; asOfDate: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: number, patch: Partial<{ price: string; asOfDate: string }>) {
    setEdits((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { price: '', asOfDate: today }), ...patch } }));
  }

  async function save() {
    const entries = Object.entries(edits).flatMap(([id, v]) => {
      const price = parseFloat(v.price);
      if (!Number.isFinite(price) || price < 0) return [];
      return [{ instrumentId: Number(id), price, asOfDate: v.asOfDate || today }];
    });
    if (!entries.length) { setError('No valid prices to save.'); return; }
    setSaving(true);
    setError(null);
    const r = await fetch('/api/personal/stocks/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Save failed');
      return;
    }
    setEdits({});
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-right">Qty Held</th>
              <th className="px-3 py-2 text-right">Avg Cost</th>
              <th className="px-3 py-2 text-right">Last Price</th>
              <th className="px-3 py-2 text-right">As-of</th>
              <th className="px-3 py-2 text-right">New Price</th>
              <th className="px-3 py-2 text-right">New As-of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = edits[r.instrumentId];
              return (
                <tr key={r.instrumentId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{r.ticker}</div>
                    <div className="text-[10px] text-slate-400">{r.name}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right">{r.qtyHeld.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">{r.avgCost.toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right">{r.lastPrice?.toFixed(4) ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{r.lastAsOf ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number" step="0.0001" inputMode="decimal"
                      placeholder={r.lastPrice?.toFixed(4) ?? ''}
                      className="w-20 px-1.5 py-1 text-xs border rounded text-right"
                      value={e?.price ?? ''}
                      onChange={(ev) => update(r.instrumentId, { price: ev.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="date"
                      className="px-1.5 py-1 text-xs border rounded"
                      value={e?.asOfDate ?? today}
                      onChange={(ev) => update(r.instrumentId, { asOfDate: ev.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="text-center px-3 py-6 text-slate-400 italic">No open positions to price.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3">
        {error && <div className="text-xs text-rose-700">{error}</div>}
        <button
          type="button"
          onClick={save}
          disabled={saving || !Object.keys(edits).length}
          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : `Save ${Object.keys(edits).length} price(s)`}
        </button>
      </div>
    </div>
  );
}
