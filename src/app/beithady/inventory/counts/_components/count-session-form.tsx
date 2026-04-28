'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, AlertCircle } from 'lucide-react';
import { createCountSessionAction } from '../actions';
import type { CountSessionType } from '@/lib/beithady/inventory/counts';

type WarehouseOpt = { id: string; label: string };

export function CountSessionForm({ warehouses }: { warehouses: WarehouseOpt[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<CountSessionType>('cycle');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [scheduledFor, setScheduledFor] = useState<string>(new Date().toISOString().slice(0, 10));
  const [sampleSize, setSampleSize] = useState<number>(10);
  const [notes, setNotes] = useState<string>('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!warehouseId) {
      setError('Warehouse is required');
      return;
    }
    startTransition(async () => {
      const res = await createCountSessionAction({
        type,
        warehouse_id: warehouseId,
        scheduled_for: scheduledFor || null,
        notes: notes || null,
        cycle_sample_size: type === 'cycle' ? sampleSize : undefined,
      });
      if (res.ok) router.push(`/beithady/inventory/counts/${res.session_id}`);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="ix-card p-5 space-y-3 text-xs">
      <Field label="Type" required>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="radio" name="type" value="cycle" checked={type === 'cycle'} onChange={() => setType('cycle')} />
            <span><strong>Cycle</strong> — random sample of stocked items</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="radio" name="type" value="physical" checked={type === 'physical'} onChange={() => setType('physical')} />
            <span><strong>Physical</strong> — every stocked item in the warehouse</span>
          </label>
        </div>
      </Field>

      <Field label="Warehouse" required>
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required className="ix-input w-full">
          <option value="">— Select —</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Scheduled for">
          <input type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="ix-input w-full" />
        </Field>
        {type === 'cycle' && (
          <Field label="Sample size (5-50)">
            <input type="number" min="5" max="50" value={sampleSize} onChange={e => setSampleSize(parseInt(e.target.value, 10) || 10)} className="ix-input w-full" />
          </Field>
        )}
      </div>

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="ix-input w-full" placeholder="What prompted this count? (e.g. monthly cycle, suspected shrinkage, audit prep)" />
      </Field>

      {error && (
        <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <a href="/beithady/inventory/counts" className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</a>
        <button type="submit" disabled={pending} className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
          <ClipboardCheck size={14} /> {pending ? 'Creating…' : 'Create session'}
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
