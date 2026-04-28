'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, FileCheck2 } from 'lucide-react';
import { createGrnDraftAction, type GrnLineInput } from '../actions';

type VendorOpt = { id: string; label: string; currency: string };
type WarehouseOpt = { id: string; label: string; building_code: string | null };
type ItemOpt = {
  id: string;
  sku: string;
  name_en: string;
  uom: string;
  default_cost_egp: number;
  batch_tracked: boolean;
  expiry_tracked: boolean;
  primary_vendor_id: string | null;
};

type LineDraft = GrnLineInput & { _key: string; _itemMeta: ItemOpt | null };

export function GrnDraftForm({
  vendors, warehouses, items,
}: {
  vendors: VendorOpt[];
  warehouses: WarehouseOpt[];
  items: ItemOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [receivedAt, setReceivedAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<LineDraft[]>([
    { _key: 'l1', _itemMeta: null, item_id: '', qty_received: 1, unit_cost_egp: 0, batch_no: '__bulk__', expiry_date: null, qc_photo_url: null, note: null },
  ]);

  const subTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty_received || 0) * Number(l.unit_cost_egp || 0)), 0),
    [lines],
  );

  // Filter items to those primary-sourced from selected vendor (heuristic UX)
  const itemChoices = useMemo(() => {
    if (!vendorId) return items;
    const fromVendor = items.filter(i => i.primary_vendor_id === vendorId);
    if (fromVendor.length > 0) return [...fromVendor, ...items.filter(i => i.primary_vendor_id !== vendorId)];
    return items;
  }, [items, vendorId]);

  function addLine() {
    setLines(ls => [
      ...ls,
      {
        _key: `l${Date.now()}_${Math.random()}`,
        _itemMeta: null,
        item_id: '',
        qty_received: 1,
        unit_cost_egp: 0,
        batch_no: '__bulk__',
        expiry_date: null,
        qc_photo_url: null,
        note: null,
      },
    ]);
  }

  function removeLine(key: string) {
    setLines(ls => ls.length > 1 ? ls.filter(l => l._key !== key) : ls);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines(ls => ls.map(l => l._key === key ? { ...l, ...patch } : l));
  }

  function pickItem(key: string, itemId: string) {
    const meta = items.find(i => i.id === itemId) || null;
    setLines(ls => ls.map(l => l._key === key ? {
      ...l,
      item_id: itemId,
      _itemMeta: meta,
      unit_cost_egp: l.unit_cost_egp || (meta?.default_cost_egp ?? 0),
      batch_no: meta?.batch_tracked ? l.batch_no : '__bulk__',
    } : l));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vendorId || !warehouseId) {
      setError('Vendor and warehouse are required');
      return;
    }
    const cleanedLines = lines
      .filter(l => l.item_id && l.qty_received > 0)
      .map(({ _key, _itemMeta, ...l }) => {
        // Strip _key/_itemMeta - they're client-only fields
        void _key;
        void _itemMeta;
        return l;
      });
    if (cleanedLines.length === 0) {
      setError('At least one valid line is required (with item and qty > 0)');
      return;
    }

    startTransition(async () => {
      const res = await createGrnDraftAction({
        vendor_id: vendorId,
        warehouse_id: warehouseId,
        received_at: receivedAt,
        notes: notes || null,
        lines: cleanedLines,
      });
      if (res.ok) {
        router.push(`/beithady/inventory/grn/${res.grn_id}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      {/* Header */}
      <section className="ix-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Vendor" required>
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} required className="ix-input w-full">
            <option value="">— Select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Warehouse" required>
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required className="ix-input w-full">
            <option value="">— Select warehouse —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </Field>
        <Field label="Received date">
          <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} className="ix-input w-full" />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="ix-input w-full" placeholder="Delivery note #, courier ref, etc." />
          </Field>
        </div>
      </section>

      {/* Lines */}
      <section className="ix-card overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Lines ({lines.length})
          </h3>
          <button
            type="button"
            onClick={addLine}
            className="text-[11px] text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-emerald-50"
          >
            <Plus size={12} /> Add line
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-2 py-1.5 w-8">#</th>
                <th className="text-left px-2 py-1.5">Item *</th>
                <th className="text-right px-2 py-1.5 w-20">Qty *</th>
                <th className="text-right px-2 py-1.5 w-20">Rejected</th>
                <th className="text-right px-2 py-1.5 w-24">Unit cost (EGP) *</th>
                <th className="text-left px-2 py-1.5 w-28">Batch #</th>
                <th className="text-left px-2 py-1.5 w-28">Expiry</th>
                <th className="text-right px-2 py-1.5 w-24">Total</th>
                <th className="text-right px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const lineTotal = Number(l.qty_received || 0) * Number(l.unit_cost_egp || 0);
                const showBatch = l._itemMeta?.batch_tracked;
                const showExpiry = l._itemMeta?.expiry_tracked;
                return (
                  <tr key={l._key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={l.item_id}
                        onChange={e => pickItem(l._key, e.target.value)}
                        className="ix-input w-full text-[11px]"
                      >
                        <option value="">— Pick item —</option>
                        {itemChoices.map(it => (
                          <option key={it.id} value={it.id}>{it.sku} — {it.name_en} ({it.uom})</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0.01" step="0.01" value={l.qty_received}
                        onChange={e => updateLine(l._key, { qty_received: parseFloat(e.target.value) || 0 })}
                        className="ix-input w-full text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={l.qty_rejected || 0}
                        onChange={e => updateLine(l._key, { qty_rejected: parseFloat(e.target.value) || 0 })}
                        className="ix-input w-full text-right text-slate-500" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={l.unit_cost_egp}
                        onChange={e => updateLine(l._key, { unit_cost_egp: parseFloat(e.target.value) || 0 })}
                        className="ix-input w-full text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      {showBatch ? (
                        <input type="text" value={l.batch_no === '__bulk__' ? '' : (l.batch_no || '')}
                          onChange={e => updateLine(l._key, { batch_no: e.target.value || '__bulk__' })}
                          placeholder="LOT-..." className="ix-input w-full font-mono text-[10px]" />
                      ) : (
                        <span className="text-slate-300 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {showExpiry ? (
                        <input type="date" value={l.expiry_date || ''}
                          onChange={e => updateLine(l._key, { expiry_date: e.target.value || null })}
                          className="ix-input w-full text-[10px]" />
                      ) : (
                        <span className="text-slate-300 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {lineTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(l._key)}
                          className="text-rose-600 hover:text-rose-800 p-0.5" title="Remove line">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan={7} className="px-2 py-2 text-right font-medium text-slate-700">Sub-total (EGP)</td>
                <td className="px-2 py-2 text-right tabular-nums font-bold">
                  {subTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {error && (
        <div className="ix-card border-rose-200 bg-rose-50 p-3 text-rose-700 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <a href="/beithady/inventory/grn" className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</a>
        <button type="submit" disabled={pending}
          className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
          <FileCheck2 size={14} /> {pending ? 'Saving…' : 'Save as draft'}
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        Draft is saved with status = <code className="font-mono">draft</code>. From the detail page you can submit it (which routes through the approval matrix if the sub-total exceeds the threshold) or post directly if no approval is required.
      </p>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
