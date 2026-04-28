'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { postTransferAction } from '../actions';

type WarehouseOpt = { id: string; label: string; building_code: string | null };
type ItemOpt = { id: string; sku: string; name_en: string; uom: string };
type LineDraft = { _key: string; item_id: string; qty: number; batch_no_picked?: string };

export function TransferForm({
  warehouses, items, stockByWarehouseAndItem,
}: {
  warehouses: WarehouseOpt[];
  items: ItemOpt[];
  stockByWarehouseAndItem: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [srcWarehouseId, setSrcWarehouseId] = useState<string>('');
  const [dstWarehouseId, setDstWarehouseId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<LineDraft[]>([
    { _key: 'l1', item_id: '', qty: 1, batch_no_picked: '' },
  ]);

  // Items with stock at the source warehouse (for picker filtering)
  const itemsAtSource = useMemo(() => {
    if (!srcWarehouseId) return items;
    const stockMap = stockByWarehouseAndItem[srcWarehouseId] || {};
    return items
      .filter(i => (stockMap[i.id] || 0) > 0)
      .map(i => ({ ...i, available: stockMap[i.id] || 0 }));
  }, [items, srcWarehouseId, stockByWarehouseAndItem]);

  function addLine() {
    setLines(ls => [...ls, { _key: `l${Date.now()}_${Math.random()}`, item_id: '', qty: 1, batch_no_picked: '' }]);
  }
  function removeLine(key: string) {
    setLines(ls => ls.length > 1 ? ls.filter(l => l._key !== key) : ls);
  }
  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines(ls => ls.map(l => l._key === key ? { ...l, ...patch } : l));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!srcWarehouseId || !dstWarehouseId) {
      setError('Source and destination warehouses are required');
      return;
    }
    if (srcWarehouseId === dstWarehouseId) {
      setError('Source and destination must differ');
      return;
    }
    const cleanedLines = lines
      .filter(l => l.item_id && l.qty > 0)
      .map(({ _key, ...l }) => { void _key; return l; });
    if (cleanedLines.length === 0) {
      setError('At least one valid line is required');
      return;
    }

    startTransition(async () => {
      const res = await postTransferAction({
        src_warehouse_id: srcWarehouseId,
        dst_warehouse_id: dstWarehouseId,
        notes: notes || null,
        lines: cleanedLines,
      });
      if (res.ok) router.push(`/beithady/inventory/transfers/${res.transfer_id}`);
      else setError(res.error);
    });
  }

  const stockMap = srcWarehouseId ? (stockByWarehouseAndItem[srcWarehouseId] || {}) : {};

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      <section className="ix-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <Field label="Source warehouse" required>
          <select value={srcWarehouseId} onChange={e => setSrcWarehouseId(e.target.value)} required className="ix-input w-full">
            <option value="">— Select —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <ArrowLeftRight size={20} className="text-emerald-600 mb-2" />
          <Field label="Destination warehouse" required>
            <select value={dstWarehouseId} onChange={e => setDstWarehouseId(e.target.value)} required className="ix-input w-full">
              <option value="">— Select —</option>
              {warehouses.filter(w => w.id !== srcWarehouseId).map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="ix-input w-full" placeholder="Reason for transfer, courier ref, etc." />
          </Field>
        </div>
      </section>

      <section className="ix-card overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Lines ({lines.length})</h3>
          <button type="button" onClick={addLine} className="text-[11px] text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-1 px-2 py-1 rounded">
            <Plus size={12} /> Add line
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-2 py-1.5 w-8">#</th>
                <th className="text-left px-2 py-1.5">Item *</th>
                <th className="text-right px-2 py-1.5 w-24">Available at source</th>
                <th className="text-right px-2 py-1.5 w-24">Qty *</th>
                <th className="text-left px-2 py-1.5 w-32">Batch (or FIFO)</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const available = l.item_id ? (stockMap[l.item_id] || 0) : 0;
                const insufficient = l.qty > available && l.item_id;
                return (
                  <tr key={l._key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <select value={l.item_id} onChange={e => updateLine(l._key, { item_id: e.target.value })} className="ix-input w-full text-[11px]">
                        <option value="">— Pick item with stock at source —</option>
                        {itemsAtSource.map(it => <option key={it.id} value={it.id}>{it.sku} — {it.name_en} ({it.uom})</option>)}
                      </select>
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${insufficient ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
                      {l.item_id ? available.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0.01" step="0.01" max={available || undefined} value={l.qty}
                        onChange={e => updateLine(l._key, { qty: parseFloat(e.target.value) || 0 })}
                        className={`ix-input w-full text-right ${insufficient ? 'border-rose-300' : ''}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={l.batch_no_picked || ''} onChange={e => updateLine(l._key, { batch_no_picked: e.target.value })}
                        placeholder="(empty = FIFO)" className="ix-input w-full font-mono text-[10px]" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(l._key)} className="text-rose-600 hover:text-rose-800 p-0.5"><Trash2 size={12} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="ix-card border-rose-200 bg-rose-50 p-3 text-rose-700 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500 italic">
          Posts immediately on submit (atomic). Rollback if any line is short on stock.
        </p>
        <div className="flex items-center gap-2">
          <a href="/beithady/inventory/transfers" className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</a>
          <button type="submit" disabled={pending} className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
            <ArrowLeftRight size={14} /> {pending ? 'Transferring…' : 'Post transfer'}
          </button>
        </div>
      </div>
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
