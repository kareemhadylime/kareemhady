'use client';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../modals/confirm-dialog';

type FxRate = {
  id: string;
  currency_code: string;
  rate_to_egp: number;
  as_of_date: string;
  notes: string | null;
};

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;

export function FxRatesSection() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [rateToEgp, setRateToEgp] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FxRate | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/personal/networth/setup/fx');
    const json = await res.json();
    if (json.ok) setRates(json.rates);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch('/api/personal/networth/setup/fx', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currencyCode,
        rateToEgp: Number(rateToEgp),
        asOfDate,
        notes: notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.ok) {
      setError(json.error ?? 'Failed to add rate');
      return;
    }
    setRateToEgp('');
    setNotes('');
    void load();
  }

  async function performDelete(id: string) {
    const res = await fetch(`/api/personal/networth/setup/fx?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Delete failed');
    }
    void load();
  }

  return (
    <section className="ix-card p-5 space-y-4">
      <h2 className="text-lg font-semibold">FX Rates</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Manual rates used to convert non-EGP balances to EGP at the snapshot date.
      </p>

      <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col text-xs">
          <span className="mb-1">Currency</span>
          <select
            className="ix-input"
            value={currencyCode}
            onChange={e => setCurrencyCode(e.target.value)}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Rate to EGP</span>
          <input
            type="number"
            step="0.0001"
            className="ix-input"
            value={rateToEgp}
            onChange={e => setRateToEgp(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">As of date</span>
          <input
            type="date"
            className="ix-input"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Notes</span>
          <input
            type="text"
            className="ix-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        <button type="submit" className="ix-btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add rate'}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-slate-500">No rates yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="py-2">Currency</th>
              <th className="py-2">Rate → EGP</th>
              <th className="py-2">As of</th>
              <th className="py-2">Notes</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rates.map(r => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-2 font-medium">{r.currency_code}</td>
                <td className="py-2">{Number(r.rate_to_egp).toFixed(4)}</td>
                <td className="py-2">{r.as_of_date}</td>
                <td className="py-2 text-slate-500">{r.notes ?? ''}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setPendingDelete(r)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete FX rate"
        tone="danger"
        confirmLabel="Delete"
        message={
          pendingDelete ? (
            <p>
              Delete the <span className="font-medium text-slate-900 dark:text-slate-100">{pendingDelete.currency_code}</span>{' '}
              rate ({Number(pendingDelete.rate_to_egp).toFixed(4)}) as of {pendingDelete.as_of_date}?
            </p>
          ) : null
        }
        onConfirm={async () => {
          if (!pendingDelete) return;
          await performDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
