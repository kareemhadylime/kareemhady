'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, FileCheck2 } from 'lucide-react';
import { createIssueDraftAction } from '../actions';
import { ISSUE_TYPE_LABEL, type IssueType } from '@/lib/beithady/inventory/issue-shared';

type WarehouseOpt = { id: string; label: string; building_code: string | null };
type ItemOpt = { id: string; sku: string; name_en: string; uom: string; total_on_hand: number };

type LineDraft = {
  _key: string;
  item_id: string;
  qty: number;
  batch_no_picked?: string;
  note?: string | null;
  _meta: ItemOpt | null;
};

export function IssueDraftForm({
  warehouses, items,
}: {
  warehouses: WarehouseOpt[];
  items: ItemOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<IssueType>('per_reservation');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [refReservation, setRefReservation] = useState<string>('');
  const [refTask, setRefTask] = useState<string>('');
  const [refOwner, setRefOwner] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [lines, setLines] = useState<LineDraft[]>([
    { _key: 'l1', _meta: null, item_id: '', qty: 1, batch_no_picked: '', note: null },
  ]);

  function addLine() {
    setLines(ls => [...ls, {
      _key: `l${Date.now()}_${Math.random()}`, _meta: null,
      item_id: '', qty: 1, batch_no_picked: '', note: null,
    }]);
  }

  function removeLine(key: string) {
    setLines(ls => ls.length > 1 ? ls.filter(l => l._key !== key) : ls);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines(ls => ls.map(l => l._key === key ? { ...l, ...patch } : l));
  }

  function pickItem(key: string, itemId: string) {
    const meta = items.find(i => i.id === itemId) || null;
    setLines(ls => ls.map(l => l._key === key ? { ...l, item_id: itemId, _meta: meta } : l));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!warehouseId) {
      setError('Warehouse is required');
      return;
    }
    if (type === 'damage_writeoff' && !photoUrl) {
      setError('Damage write-offs require a photo URL (mandatory per V1 policy)');
      return;
    }
    const cleanedLines = lines
      .filter(l => l.item_id && l.qty > 0)
      .map(({ _key, _meta, ...l }) => {
        void _key;
        void _meta;
        return l;
      });
    if (cleanedLines.length === 0) {
      setError('At least one valid line is required');
      return;
    }

    startTransition(async () => {
      const res = await createIssueDraftAction({
        type,
        warehouse_id: warehouseId,
        ref_reservation_id: refReservation || null,
        ref_task_id: refTask || null,
        ref_owner: refOwner || null,
        notes: notes || null,
        photo_url: photoUrl || null,
        created_via: 'manual',
        lines: cleanedLines,
      });
      if (res.ok) router.push(`/beithady/inventory/issue/${res.issue_id}`);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      <section className="ix-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Type" required>
          <select value={type} onChange={e => setType(e.target.value as IssueType)} className="ix-input w-full" required>
            {(Object.keys(ISSUE_TYPE_LABEL) as IssueType[]).map(t => (
              <option key={t} value={t}>{ISSUE_TYPE_LABEL[t].en}</option>
            ))}
          </select>
        </Field>
        <Field label="Warehouse" required>
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required className="ix-input w-full">
            <option value="">— Select —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </Field>
        {type === 'per_reservation' && (
          <Field label="Reservation ID">
            <input type="text" value={refReservation} onChange={e => setRefReservation(e.target.value)} className="ix-input w-full font-mono" placeholder="guesty res id" />
          </Field>
        )}
        {type === 'maintenance_task' && (
          <Field label="Task ID (uuid)">
            <input type="text" value={refTask} onChange={e => setRefTask(e.target.value)} className="ix-input w-full font-mono" placeholder="beithady_tasks.id" />
          </Field>
        )}
        {type === 'owner_request' && (
          <Field label="Owner identifier">
            <input type="text" value={refOwner} onChange={e => setRefOwner(e.target.value)} className="ix-input w-full" placeholder="A1HOSPITALITY / FZCO / ..." />
          </Field>
        )}
        <div className="sm:col-span-3">
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="ix-input w-full" />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label={type === 'damage_writeoff' ? 'Photo URL (required)' : 'Photo URL'} required={type === 'damage_writeoff'}>
            <input type="url" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} required={type === 'damage_writeoff'} className="ix-input w-full" placeholder="https://...beithady-inventory storage URL" />
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
                <th className="text-right px-2 py-1.5 w-20">Qty *</th>
                <th className="text-left px-2 py-1.5 w-28">Batch (or FIFO)</th>
                <th className="text-right px-2 py-1.5 w-24">On hand</th>
                <th className="text-left px-2 py-1.5">Note</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l._key} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <select value={l.item_id} onChange={e => pickItem(l._key, e.target.value)} className="ix-input w-full text-[11px]">
                      <option value="">— Pick item —</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.sku} — {it.name_en} ({it.uom})</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0.01" step="0.01" value={l.qty} onChange={e => updateLine(l._key, { qty: parseFloat(e.target.value) || 0 })} className="ix-input w-full text-right" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={l.batch_no_picked || ''} onChange={e => updateLine(l._key, { batch_no_picked: e.target.value })} placeholder="(empty = FIFO)" className="ix-input w-full font-mono text-[10px]" />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {l._meta ? `${l._meta.total_on_hand.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${l._meta.uom}` : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={l.note || ''} onChange={e => updateLine(l._key, { note: e.target.value || null })} className="ix-input w-full text-[10px]" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(l._key)} className="text-rose-600 hover:text-rose-800 p-0.5"><Trash2 size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="ix-card border-rose-200 bg-rose-50 p-3 text-rose-700 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <a href="/beithady/inventory/issue" className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</a>
        <button type="submit" disabled={pending} className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
          <FileCheck2 size={14} /> {pending ? 'Saving…' : 'Save as draft'}
        </button>
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
