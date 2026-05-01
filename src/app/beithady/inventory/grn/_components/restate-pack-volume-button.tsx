'use client';

import { useState, useTransition } from 'react';
import { Ruler, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { restateGrnLinePackVolumeAction } from '../actions';

// M.16 (Q6=a) — restate a GRN line's received pack volume.
// Shown next to the qty cell on draft/submitted GRN lines. Operator
// uses this when the actual delivered packaging differs from what the
// SKU's stored pack_volume said (e.g. SKU was 1L but vendor sent 4kg).
//
// Modal accepts numeric value + UoM dropdown + an "also update SKU"
// checkbox. After save, the row's audit trail captures the restate
// and (optionally) the SKU's pack_volume_* is bumped to match the
// new shipment so future estimator runs use accurate per-unit costs.

const UOM_OPTIONS = [
  { group: 'Mass', options: [['kg', 'kg (Kilogram)'], ['g', 'g (Gram)']] },
  { group: 'Volume', options: [['L', 'L (Liter)'], ['ml', 'ml (Milliliter)']] },
  { group: 'Count', options: [['pcs', 'pcs'], ['pack', 'pack'], ['sachet', 'sachet']] },
] as const;

export function RestatePackVolumeButton({
  grnId,
  lineId,
  itemSku,
  itemName,
  currentValue,
  currentUom,
  canEdit,
  grnIsOpen,
}: {
  grnId: string;
  lineId: string;
  itemSku: string;
  itemName: string;
  currentValue: number | null;
  currentUom: string | null;
  canEdit: boolean;
  /** Only draft/submitted GRNs are amendable. */
  grnIsOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(currentValue != null ? String(currentValue) : '');
  const [uom, setUom] = useState<string>(currentUom || 'kg');
  const [alsoUpdateSku, setAlsoUpdateSku] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit || !grnIsOpen) return null;

  function save() {
    setError(null);
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      setError('Volume must be a positive number');
      return;
    }
    if (!uom.trim()) {
      setError('UoM required');
      return;
    }
    startTransition(async () => {
      const res = await restateGrnLinePackVolumeAction({
        grnId,
        lineId,
        receivedPackVolumeValue: num,
        receivedPackVolumeUom: uom,
        alsoUpdateSkuPackVolume: alsoUpdateSku,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(currentValue != null ? String(currentValue) : '');
          setUom(currentUom || 'kg');
          setError(null);
          setOpen(true);
        }}
        title={
          currentValue != null
            ? `Received pack volume on file: ${currentValue} ${currentUom}. Click to amend.`
            : 'Record the actual delivered pack volume (e.g. when the vendor sent 4kg packs instead of the SKU\'s 1L bottles).'
        }
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <Ruler size={10} />
        {currentValue != null ? `${currentValue} ${currentUom}` : 'Restate'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--bh-heading)' }}>
                  Restate received pack volume
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {itemSku} — <span className="font-sans">{itemName}</span>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2.5 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>
                  Use this when the actual delivered packaging differs from what
                  the SKU&apos;s stored pack volume said. Future estimator runs
                  will use the new pack volume if you opt to update the SKU.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                    Received volume *
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="e.g. 4"
                    className="ix-input w-full text-right"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                    UoM *
                  </span>
                  <select value={uom} onChange={e => setUom(e.target.value)} className="ix-input w-full">
                    {UOM_OPTIONS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.options.map(([code, label]) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={alsoUpdateSku}
                  onChange={e => setAlsoUpdateSku(e.target.checked)}
                />
                <span>
                  Also update SKU&apos;s <code>pack_volume</code> to match this shipment
                </span>
              </label>
              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 rounded p-2 text-[11px]">
                  {error}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />}
                  {pending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
