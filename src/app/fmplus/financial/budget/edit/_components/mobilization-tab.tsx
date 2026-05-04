'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Trash2 } from 'lucide-react';
import { saveMobilizationAction } from '../actions';

type MobCategory = 'capex' | 'opex_one_time' | 'training' | 'recruitment';
type MobAmort = 'straight_line' | 'flat';

interface MobRow {
  category: MobCategory;
  label_en: string;
  label_ar: string | null;
  qty: number;
  unit_cost: number;
  amortization: MobAmort;
  amortization_months: number;
  notes: string | null;
}

interface Props {
  contractId: number;
  contractName: string;
  durationMonths: number;
  initialRows: MobRow[];
  canEdit: boolean;
  defaultAmortMonths: number; // from budget_settings.default_mob_amortization_months
}

const CATEGORY_LABELS: Record<MobCategory, string> = {
  capex: 'CapEx',
  opex_one_time: 'OpEx (one-time)',
  training: 'Training',
  recruitment: 'Recruitment',
};

export function MobilizationTab({ contractId, contractName, durationMonths, initialRows, canEdit, defaultAmortMonths }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MobRow[]>(initialRows);

  const updateRow = (idx: number, patch: Partial<MobRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows(prev => [...prev, {
      category: 'capex',
      label_en: '',
      label_ar: null,
      qty: 1,
      unit_cost: 0,
      amortization: 'straight_line',
      amortization_months: defaultAmortMonths,
      notes: null,
    }]);
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const onSave = () => {
    if (!canEdit) return;
    // Validate: all label_en non-empty
    const invalid = rows.findIndex(r => !r.label_en.trim());
    if (invalid >= 0) {
      setError(`Row ${invalid + 1} needs a label.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveMobilizationAction({ contract_id: contractId, rows });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const totalCapex = rows.reduce((a, r) => a + r.qty * r.unit_cost, 0);
  const totalAmortPerMonth = rows.reduce((a, r) =>
    a + (r.amortization === 'flat' ? 0 : (r.qty * r.unit_cost) / r.amortization_months), 0
  );

  return (
    <div className="space-y-3">
      <div className="bg-bg-tertiary border border-border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div>
            <strong className="text-sm text-text-primary">Mobilization · {contractName}</strong>
            <div className="text-[11px] text-text-secondary mt-0.5">
              Project-level capex/opex/training/recruitment. Amortized over {durationMonths} months of contract via variance.
            </div>
          </div>
          <span className="text-xs text-text-secondary text-right">
            Total: <strong className="tabular-nums">{totalCapex.toLocaleString()}</strong> EGP
            {' · '}
            Avg/mo (straight-line): <strong className="tabular-nums">{totalAmortPerMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-text-secondary italic py-4 text-center">
            No mobilization items yet. Click &quot;+ Add line&quot; to seed.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, idx) => {
              const total = r.qty * r.unit_cost;
              const monthlyAmort = r.amortization === 'flat' ? total : total / r.amortization_months;
              return (
                <div key={idx} className="bg-bg-secondary border border-border rounded p-3 space-y-2">
                  <div className="flex flex-wrap gap-2 items-end">
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">Category</span>
                      <select value={r.category}
                        onChange={e => updateRow(idx, { category: e.currentTarget.value as MobCategory })}
                        disabled={!canEdit || isPending}
                        className="text-sm bg-bg-primary border border-border rounded px-2 py-1 disabled:opacity-50">
                        {(Object.keys(CATEGORY_LABELS) as MobCategory[]).map(c => (
                          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block flex-1 min-w-[200px]">
                      <span className="text-[10px] text-text-secondary uppercase block">Label (English)</span>
                      <input value={r.label_en}
                        onChange={e => updateRow(idx, { label_en: e.currentTarget.value })}
                        disabled={!canEdit || isPending}
                        placeholder="e.g. Site setup, vehicle leases (3 mo deposit)"
                        className="w-full text-sm bg-bg-primary border border-border rounded px-2 py-1 disabled:opacity-50" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">Qty</span>
                      <input type="number" min="0" step="0.01" value={r.qty}
                        onChange={e => updateRow(idx, { qty: Number(e.currentTarget.value) || 0 })}
                        disabled={!canEdit || isPending}
                        className="w-20 px-2 py-1 text-sm bg-bg-primary border border-border rounded text-right tabular-nums disabled:opacity-50" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">Unit cost</span>
                      <input type="number" min="0" step="0.01" value={r.unit_cost}
                        onChange={e => updateRow(idx, { unit_cost: Number(e.currentTarget.value) || 0 })}
                        disabled={!canEdit || isPending}
                        className="w-28 px-2 py-1 text-sm bg-bg-primary border border-border rounded text-right tabular-nums disabled:opacity-50" />
                    </label>
                    <button type="button" onClick={() => removeRow(idx)}
                      disabled={!canEdit || isPending}
                      className="text-text-secondary hover:text-red-500 mb-1 disabled:opacity-50"
                      title="Remove line">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-end">
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">Amortization</span>
                      <select value={r.amortization}
                        onChange={e => updateRow(idx, { amortization: e.currentTarget.value as MobAmort })}
                        disabled={!canEdit || isPending}
                        className="text-sm bg-bg-primary border border-border rounded px-2 py-1 disabled:opacity-50">
                        <option value="straight_line">Straight-line</option>
                        <option value="flat">Flat (month 1)</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">Months</span>
                      <input type="number" min="1" max="120" value={r.amortization_months}
                        onChange={e => updateRow(idx, { amortization_months: Math.max(1, Number(e.currentTarget.value) || 1) })}
                        disabled={!canEdit || isPending || r.amortization === 'flat'}
                        className="w-16 px-2 py-1 text-sm bg-bg-primary border border-border rounded text-right tabular-nums disabled:opacity-50" />
                    </label>
                    <label className="block flex-1 min-w-[150px]">
                      <span className="text-[10px] text-text-secondary uppercase block">Label (Arabic)</span>
                      <input value={r.label_ar ?? ''}
                        onChange={e => updateRow(idx, { label_ar: e.currentTarget.value || null })}
                        disabled={!canEdit || isPending}
                        dir="rtl"
                        className="w-full text-sm bg-bg-primary border border-border rounded px-2 py-1 disabled:opacity-50" />
                    </label>
                    <div className="text-[10px] text-text-secondary tabular-nums text-right ml-auto">
                      <div>Total: <strong>{total.toLocaleString()}</strong></div>
                      <div>/mo: <strong>{monthlyAmort.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          {canEdit && (
            <button type="button" onClick={addRow}
              className="text-xs px-3 py-1.5 bg-bg-secondary border border-border rounded text-text-primary hover:bg-bg-tertiary flex items-center gap-1">
              <Plus size={12} /> Add line
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button type="button" onClick={onSave} disabled={!canEdit || isPending}
              className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
              <Save size={12} /> {isPending ? 'Saving…' : 'Save Mobilization'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
