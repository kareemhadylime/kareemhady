'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FmplusCatalogItem } from '@/lib/fmplus/budget/schema';
import { saveOverrideAction, removeOverrideAction } from '../actions';
import { Trash2, Save } from 'lucide-react';

interface OverrideRow {
  id: number;
  contract_id: number;
  catalog_item_id: number;
  unit_cost: number | null;
  notes: string | null;
  project_contracts?: { name: string } | null;
}

interface Props {
  item: FmplusCatalogItem | null;
  otherOverrides: OverrideRow[];
  contracts: { id: number; name: string }[];
  canEdit: boolean;
}

export function OverrideSidePanel({ item, otherOverrides, contracts, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [contractId, setContractId] = useState<number | ''>('');
  const [unitCost, setUnitCost] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  if (!item) {
    return (
      <aside className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
        <div className="text-xs uppercase font-semibold mb-2">Per-project overrides</div>
        <p>Select a row from the catalog to manage its per-project price overrides.</p>
      </aside>
    );
  }

  const onSave = async () => {
    if (!contractId || !unitCost) return;
    if (!canEdit) return;
    startTransition(async () => {
      await saveOverrideAction({
        contract_id: Number(contractId),
        catalog_item_id: item.id!,
        unit_cost: Number(unitCost),
        notes: notes || null,
      });
      router.refresh();
    });
  };

  const onRemove = async (cId: number) => {
    if (!canEdit) return;
    if (!confirm('Remove this override? Falls back to catalog default afterward.')) return;
    startTransition(async () => {
      await removeOverrideAction(cId, item.id!);
      router.refresh();
    });
  };

  const defaultPrice = Number(item.default_price);
  const overrideValue = unitCost ? Number(unitCost) : null;
  const deltaPct =
    overrideValue !== null && defaultPrice > 0
      ? ((overrideValue - defaultPrice) / defaultPrice) * 100
      : null;

  return (
    <aside className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-4 space-y-4 overflow-y-auto">
      <div className="flex justify-between items-center">
        <strong className="text-sm text-slate-900 dark:text-slate-100">Per-project overrides</strong>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">selected item</span>
      </div>

      {/* Selected item summary */}
      <div className="bg-slate-50 dark:bg-slate-800 border border-indigo-500 rounded p-3 text-xs">
        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.code}</div>
        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
          {item.name_en}
          {item.name_ar ? ` · ${item.name_ar}` : ''}
        </div>
        <div className="mt-1.5 flex justify-between">
          <span className="text-slate-500 dark:text-slate-400">Default price:</span>
          <strong className="tabular-nums">
            {defaultPrice.toLocaleString()} EGP / {item.unit}
          </strong>
        </div>
      </div>

      {/* Override entry form (admin-only) */}
      {canEdit ? (
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-1">Override for contract</div>
          <select
            value={contractId}
            onChange={(e) =>
              setContractId(e.currentTarget.value ? Number(e.currentTarget.value) : '')
            }
            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mb-2"
          >
            <option value="">— Pick contract —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {contractId !== '' && (
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 space-y-2">
              <div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Override unit price (EGP)</div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.currentTarget.value)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-right tabular-nums"
                />
                {deltaPct !== null && (
                  <div
                    className={`text-[10px] mt-1 ${
                      deltaPct >= 0 ? 'text-amber-400' : 'text-green-400'
                    }`}
                  >
                    {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}% vs default
                  </div>
                )}
              </div>
              <div>
                <textarea
                  placeholder="Notes (e.g. site allowance, transport bundled)"
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                  className="w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 resize-y h-12"
                />
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={isPending || !unitCost}
                className="w-full text-xs px-3 py-1.5 bg-indigo-600 text-white rounded font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Save size={12} /> Save override
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          View-only access. Admin role required to edit overrides.
        </div>
      )}

      {/* Existing overrides list */}
      {otherOverrides.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-1.5">
            Other overrides for this item
          </div>
          <div className="space-y-1 text-xs">
            {otherOverrides.map((o) => {
              const value = o.unit_cost != null ? Number(o.unit_cost) : null;
              const delta =
                value != null && defaultPrice > 0
                  ? ((value - defaultPrice) / defaultPrice) * 100
                  : null;
              return (
                <div
                  key={o.id}
                  className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700"
                >
                  <span className="truncate">
                    {o.project_contracts?.name ?? `Contract #${o.contract_id}`}
                  </span>
                  <span className="tabular-nums flex items-center gap-1">
                    <span>{value?.toLocaleString() ?? '—'}</span>
                    {delta !== null && (
                      <span
                        className={`text-[10px] ${
                          delta >= 0 ? 'text-amber-400' : 'text-green-400'
                        }`}
                      >
                        {delta >= 0 ? '+' : ''}
                        {delta.toFixed(1)}%
                      </span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => onRemove(o.contract_id)}
                        className="ml-1 text-slate-500 dark:text-slate-400 hover:text-red-500"
                        title="Remove override"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {otherOverrides.length === 0 && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
          No overrides yet for this item.
        </div>
      )}
    </aside>
  );
}
