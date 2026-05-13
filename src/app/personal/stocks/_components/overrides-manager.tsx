'use client';

// OverridesManager — client component for the Portfolio tab.
// Lists every personal_stock_position_overrides row (active + zero-out),
// lets the user upsert via the "Add / Edit override" modal, or delete a row
// to revert to computed positions.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OverrideRow } from '@/lib/personal/stocks/queries';
import { fmtEgp } from './kpi-tile';

type Account = { id: number; code: string; kind: string };
type Instrument = { id: number; ticker: string; name: string; kind: string };

type Draft = {
  id?: string;
  accountId: number | '';
  instrumentId: number | '';
  qtyHeld: string;
  avgCost: string;
  note: string;
  asOfDate: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyDraft = (): Draft => ({
  accountId: '',
  instrumentId: '',
  qtyHeld: '',
  avgCost: '',
  note: '',
  asOfDate: today(),
});

export function OverridesManager({
  overrides,
  accounts,
  instruments,
}: {
  overrides: OverrideRow[];
  accounts: Account[];
  instruments: Instrument[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setDraft(emptyDraft());
    setError(null);
    setOpen(true);
  }

  function openEdit(o: OverrideRow) {
    setDraft({
      id: o.id,
      accountId: o.accountId,
      instrumentId: o.instrumentId,
      qtyHeld: String(o.qtyHeld),
      avgCost: String(o.avgCost),
      note: o.note ?? '',
      asOfDate: o.asOfDate,
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    if (draft.accountId === '' || draft.instrumentId === '') {
      setError('Account and instrument are required.');
      return;
    }
    const qty = parseFloat(draft.qtyHeld);
    const avg = parseFloat(draft.avgCost);
    if (!Number.isFinite(qty) || qty < 0) {
      setError('Qty must be a non-negative number.');
      return;
    }
    if (!Number.isFinite(avg) || avg < 0) {
      setError('Avg cost must be a non-negative number.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.asOfDate)) {
      setError('As-of date must be YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    const r = await fetch('/api/personal/stocks/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: draft.accountId,
        instrumentId: draft.instrumentId,
        qtyHeld: qty,
        avgCost: avg,
        note: draft.note.trim() || null,
        asOfDate: draft.asOfDate,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Save failed');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Remove override for ${label}? Position will revert to computed.`)) return;
    setBusy(true);
    const r = await fetch(`/api/personal/stocks/overrides/${id}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(`Delete failed: ${j.error ?? 'unknown'}`);
      return;
    }
    router.refresh();
  }

  const active = overrides.filter((o) => o.qtyHeld > 0);
  const zeroed = overrides.filter((o) => o.qtyHeld === 0);

  return (
    <div className="ix-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <div>
          <div className="text-sm font-semibold">Position overrides</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Manual reconcile rows. Active overrides win over computed positions;
            qty=0 hides a phantom position from the holdings table.
          </div>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"
        >
          + Add override
        </button>
      </div>

      <Section title="Active (qty > 0)" rows={active} onEdit={openEdit} onRemove={remove} />
      <Section title="Zero-out (hidden from positions)" rows={zeroed} onEdit={openEdit} onRemove={remove} muted />

      {open && (
        <OverrideModal
          draft={draft}
          setDraft={setDraft}
          accounts={accounts}
          instruments={instruments}
          busy={busy}
          error={error}
          onCancel={() => setOpen(false)}
          onSave={save}
        />
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  onEdit,
  onRemove,
  muted,
}: {
  title: string;
  rows: OverrideRow[];
  onEdit: (o: OverrideRow) => void;
  onRemove: (id: string, label: string) => void;
  muted?: boolean;
}) {
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
        {title} · {rows.length}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 dark:text-slate-400 text-left">
            <tr>
              <th className="px-3 py-1.5">Account</th>
              <th className="px-3 py-1.5">Ticker</th>
              <th className="px-3 py-1.5 text-right">Qty</th>
              <th className="px-3 py-1.5 text-right">Avg Cost</th>
              <th className="px-3 py-1.5 text-right">Cost Basis</th>
              <th className="px-3 py-1.5">As-of</th>
              <th className="px-3 py-1.5">Note</th>
              <th className="px-3 py-1.5 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                className={`border-t border-slate-100 dark:border-slate-800 ${
                  muted ? 'text-slate-500' : ''
                }`}
              >
                <td className="px-3 py-1.5">{o.accountCode}</td>
                <td className="px-3 py-1.5">
                  <div className="font-medium">{o.ticker}</div>
                  <div className="text-[10px] text-slate-400">{o.name}</div>
                </td>
                <td className="px-3 py-1.5 text-right">{o.qtyHeld.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">{o.avgCost.toFixed(4)}</td>
                <td className="px-3 py-1.5 text-right">
                  {fmtEgp(o.qtyHeld * o.avgCost)}
                </td>
                <td className="px-3 py-1.5">{o.asOfDate}</td>
                <td className="px-3 py-1.5 max-w-[260px] truncate text-slate-500">
                  {o.note ?? ''}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onEdit(o)}
                    className="text-emerald-600 hover:underline text-[11px] mr-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(o.id, `${o.accountCode}/${o.ticker}`)}
                    className="text-rose-600 hover:underline text-[11px]"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="text-center px-3 py-4 text-slate-400 italic">
                  None.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverrideModal({
  draft,
  setDraft,
  accounts,
  instruments,
  busy,
  error,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  accounts: Account[];
  instruments: Instrument[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="ix-card w-full max-w-md bg-white dark:bg-slate-900 p-4">
        <div className="text-sm font-semibold mb-3">
          {draft.id ? 'Edit override' : 'Add override'}
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Account</label>
            <select
              value={draft.accountId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  accountId: e.target.value ? Number(e.target.value) : '',
                })
              }
              disabled={Boolean(draft.id)}
              className="w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800"
            >
              <option value="">— pick —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} ({a.kind})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Instrument</label>
            <select
              value={draft.instrumentId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  instrumentId: e.target.value ? Number(e.target.value) : '',
                })
              }
              disabled={Boolean(draft.id)}
              className="w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800"
            >
              <option value="">— pick —</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ticker} — {i.name} ({i.kind})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Qty held</label>
              <input
                type="number"
                step="0.000001"
                inputMode="decimal"
                value={draft.qtyHeld}
                onChange={(e) => setDraft({ ...draft, qtyHeld: e.target.value })}
                className="w-full px-2 py-1.5 border rounded text-right bg-white dark:bg-slate-800"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Avg cost (EGP)</label>
              <input
                type="number"
                step="0.0001"
                inputMode="decimal"
                value={draft.avgCost}
                onChange={(e) => setDraft({ ...draft, avgCost: e.target.value })}
                className="w-full px-2 py-1.5 border rounded text-right bg-white dark:bg-slate-800"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">As-of date</label>
            <input
              type="date"
              value={draft.asOfDate}
              onChange={(e) => setDraft({ ...draft, asOfDate: e.target.value })}
              className="w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Note</label>
            <textarea
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 min-h-[60px]"
              placeholder="optional context (IPO allocation, transfer source, …)"
            />
          </div>
          {error && <div className="text-rose-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
