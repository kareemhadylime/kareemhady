'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Save } from 'lucide-react';
import { saveItemAction } from '../actions';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SERVICES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];
const CATEGORIES: Category[] = ['manning','ppe','tools','consumables','transport','it','governmental','other'];
const UNITS: Array<'each'|'monthly'|'annual'|'per_head'|'liter'|'kg'|'m2'|'pct_revenue'> = [
  'each','monthly','annual','per_head','liter','kg','m2','pct_revenue',
];

export function AddItemModal({ open, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [unit, setUnit] = useState<'each'|'monthly'|'annual'|'per_head'|'liter'|'kg'|'m2'|'pct_revenue'>('each');
  const [defaultPrice, setDefaultPrice] = useState('0');
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(['hk']);
  const [category, setCategory] = useState<Category>('tools');
  const [tags, setTags] = useState('');

  const reset = () => {
    setCode(''); setNameEn(''); setNameAr(''); setUnit('each');
    setDefaultPrice('0'); setServiceLines(['hk']); setCategory('tools'); setTags('');
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  const toggleService = (sl: ServiceLine) => {
    setServiceLines(prev => prev.includes(sl) ? prev.filter(s => s !== sl) : [...prev, sl]);
  };

  const onSave = () => {
    if (!code.trim() || !nameEn.trim()) {
      setError('Code and English name are required.');
      return;
    }
    if (serviceLines.length === 0) {
      setError('Pick at least one service line.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveItemAction({
          code: code.trim(),
          name_en: nameEn.trim(),
          name_ar: nameAr.trim() || null,
          unit,
          default_price: Number(defaultPrice) || 0,
          service_lines: serviceLines,
          category,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          is_active: true,
        });
        router.refresh();
        handleClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-primary border border-border rounded-lg max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border bg-bg-tertiary">
          <strong className="text-sm text-text-primary">+ Add catalog item</strong>
          <button onClick={handleClose} className="text-text-secondary hover:text-text-primary"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <label className="block">
            <span className="text-[10px] text-text-secondary uppercase">Code <span className="text-red-400">*</span></span>
            <input value={code} onChange={e => setCode(e.currentTarget.value)} disabled={isPending}
              placeholder="e.g. tool_pressure_washer"
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 font-mono disabled:opacity-50" />
          </label>

          <label className="block">
            <span className="text-[10px] text-text-secondary uppercase">Name (English) <span className="text-red-400">*</span></span>
            <input value={nameEn} onChange={e => setNameEn(e.currentTarget.value)} disabled={isPending}
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 disabled:opacity-50" />
          </label>

          <label className="block">
            <span className="text-[10px] text-text-secondary uppercase">Name (Arabic, optional)</span>
            <input value={nameAr} onChange={e => setNameAr(e.currentTarget.value)} disabled={isPending} dir="rtl"
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 disabled:opacity-50" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] text-text-secondary uppercase">Unit</span>
              <select value={unit} onChange={e => setUnit(e.currentTarget.value as typeof unit)} disabled={isPending}
                className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 disabled:opacity-50">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-text-secondary uppercase">Default price (EGP)</span>
              <input type="number" min="0" step="0.01" value={defaultPrice}
                onChange={e => setDefaultPrice(e.currentTarget.value)} disabled={isPending}
                className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 text-right tabular-nums disabled:opacity-50" />
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] text-text-secondary uppercase">Category</span>
            <select value={category} onChange={e => setCategory(e.currentTarget.value as Category)} disabled={isPending}
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 disabled:opacity-50">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div>
            <span className="text-[10px] text-text-secondary uppercase">Service lines (pick &#x2265;1)</span>
            <div className="grid grid-cols-2 gap-1.5 mt-1 text-xs">
              {SERVICES.map(sl => (
                <label key={sl} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={serviceLines.includes(sl)}
                    onChange={() => toggleService(sl)} disabled={isPending} />
                  <span>{sl.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] text-text-secondary uppercase">Tags (comma-separated)</span>
            <input value={tags} onChange={e => setTags(e.currentTarget.value)} disabled={isPending}
              placeholder="e.g. cleaning, machinery"
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-0.5 disabled:opacity-50" />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-border bg-bg-tertiary flex justify-end gap-2">
          <button onClick={handleClose} disabled={isPending}
            className="text-xs px-3 py-1.5 text-text-secondary border border-border rounded hover:bg-bg-secondary">
            Cancel
          </button>
          <button onClick={onSave} disabled={isPending || !code.trim() || !nameEn.trim()}
            className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
            <Save size={12} /> {isPending ? 'Saving…' : 'Add item'}
          </button>
        </div>
      </div>
    </div>
  );
}
