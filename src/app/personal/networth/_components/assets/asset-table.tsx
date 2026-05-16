'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Plus, X } from 'lucide-react';
import type { AssetKind } from '@/lib/personal/networth/types';
import { AddAssetModal } from '../modals/add-asset-modal';
import { ConfirmDialog } from '../modals/confirm-dialog';

type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  currency: string;
  balance: number;
  as_of_date: string;
  notes: string | null;
};

const LIQUID_KINDS: AssetKind[] = ['cash'];
const ILLIQUID_KINDS: AssetKind[] = ['real_estate', 'vehicle', 'gold_jewelry', 'other'];

const KIND_LABEL: Record<AssetKind, string> = {
  cash: 'Cash',
  real_estate: 'Real estate',
  vehicle: 'Vehicle',
  gold_jewelry: 'Gold / jewelry',
  other: 'Other',
};

type Filter = 'all' | AssetKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'cash', label: 'Cash' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'gold_jewelry', label: 'Gold / jewelry' },
  { value: 'other', label: 'Other' },
];

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function fmtEgp(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function AssetTable({
  assets,
  stocksPipeEgp,
}: {
  assets: Asset[];
  stocksPipeEgp: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const visible = useMemo(
    () => (filter === 'all' ? assets : assets.filter(a => a.kind === filter)),
    [assets, filter]
  );

  // KPI: same-currency totals (Option B — no FX dependency, no N+1).
  const kpi = useMemo(() => {
    const egpAssets = assets.filter(a => a.currency === 'EGP');
    const egpLiquid = egpAssets
      .filter(a => LIQUID_KINDS.includes(a.kind))
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const egpIlliquid = egpAssets
      .filter(a => ILLIQUID_KINDS.includes(a.kind))
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const totalEgp = egpLiquid + egpIlliquid + stocksPipeEgp;
    // Stocks pipe is liquid by nature.
    const liquidEgp = egpLiquid + stocksPipeEgp;

    // Subtotals for non-EGP currencies.
    const nonEgp: Record<string, number> = {};
    for (const a of assets) {
      if (a.currency === 'EGP') continue;
      nonEgp[a.currency] = (nonEgp[a.currency] ?? 0) + Number(a.balance);
    }
    const currencyCount = new Set(assets.map(a => a.currency)).size;

    return {
      totalEgp,
      liquidEgp,
      illiquidEgp: egpIlliquid,
      nonEgp,
      currencyCount,
    };
  }, [assets, stocksPipeEgp]);

  async function performDelete(id: string) {
    const res = await fetch(`/api/personal/networth/assets/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error ?? 'Delete failed');
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total assets (EGP only)" value={fmtEgp(kpi.totalEgp)} />
        <KpiCard label="Liquid (cash + stocks)" value={fmtEgp(kpi.liquidEgp)} />
        <KpiCard label="Illiquid" value={fmtEgp(kpi.illiquidEgp)} />
        <KpiCard label="# Currencies" value={String(kpi.currencyCount)} />
      </div>

      {/* Non-EGP subtotals (only if any) */}
      {Object.keys(kpi.nonEgp).length > 0 && (
        <div className="ix-card p-3 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-medium text-slate-500 dark:text-slate-400">Non-EGP totals (native):</span>
          {Object.entries(kpi.nonEgp).map(([cur, amt]) => (
            <span key={cur}>
              <span className="font-semibold">{cur}</span> {fmtAmount(amt, cur)}
            </span>
          ))}
        </div>
      )}

      {/* Filter chips + Add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs rounded-full border transition ${
                filter === f.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="ix-btn-primary"
        >
          <Plus size={16} />
          Add asset
        </button>
      </div>

      {/* Table */}
      <div className="ix-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">As of</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {/* Read-only stocks pipe row */}
              <tr className="bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <Lock size={12} className="text-slate-400" />
                    AOLB Stocks
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    auto-piped from{' '}
                    <Link href="/personal/stocks" className="ix-link">
                      /personal/stocks
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">stocks</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">EGP</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {fmtEgp(stocksPipeEgp)}
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">live</td>
                <td className="px-3 py-2 text-slate-400 italic text-xs">read-only</td>
                <td className="px-3 py-2 text-right text-xs text-slate-400">—</td>
              </tr>

              {visible.map(a => (
                <tr
                  key={a.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {a.name}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{a.currency}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtAmount(Number(a.balance), a.currency)}
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{a.as_of_date}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[260px] truncate">
                    {a.notes ?? ''}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditTarget(a)}
                      className="text-xs text-indigo-600 hover:underline mr-3"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ id: a.id, name: a.name })}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-sm text-slate-400 italic"
                  >
                    {assets.length === 0
                      ? 'No assets yet. Add your first one above.'
                      : 'No assets match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddAssetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => router.refresh()}
      />

      {editTarget && (
        <UpdateBalanceModal
          asset={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove asset"
        tone="danger"
        confirmLabel="Remove"
        message={
          pendingDelete ? (
            <p>
              Remove <span className="font-medium text-slate-900 dark:text-slate-100">&ldquo;{pendingDelete.name}&rdquo;</span>?
              This soft-deletes the asset (active=false).
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
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function UpdateBalanceModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: Asset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [balance, setBalance] = useState(String(asset.balance));
  const [asOfDate, setAsOfDate] = useState(asset.as_of_date);
  const [notes, setNotes] = useState(asset.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const balanceNum = parseFloat(balance);
    if (!Number.isFinite(balanceNum)) {
      setError('Balance must be a number.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      setError('As-of date must be YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/personal/networth/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        balance: balanceNum,
        asOfDate,
        notes: notes.trim() || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? 'Save failed.');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-md bg-white dark:bg-slate-900 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Update balance
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {asset.name} · {asset.currency}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">New balance ({asset.currency})</span>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              className="ix-input text-right"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">As of</span>
            <input
              type="date"
              className="ix-input"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Notes</span>
            <textarea
              className="ix-input min-h-[64px] py-2"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="optional"
            />
          </label>

          {error && (
            <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="ix-btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="ix-btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
