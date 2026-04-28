'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ItemRow, Category, Uom } from '@/lib/beithady/inventory/catalog';
import { createItemAction, updateItemAction, toggleItemActiveAction, type ItemFormInput } from '../actions';

type Mode = 'create' | 'edit';

export function ItemFormButton({
  mode, existing, categories, uoms, triggerLabel, triggerClass,
}: {
  mode: Mode;
  existing?: ItemRow;
  categories: Category[];
  uoms: Uom[];
  triggerLabel: ReactNode;
  triggerClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial: ItemFormInput = mode === 'edit' && existing
    ? {
        sku: existing.sku,
        name_en: existing.name_en,
        name_ar: existing.name_ar,
        category_id: existing.category_id,
        uom: existing.uom,
        brand: existing.brand,
        barcode: existing.barcode,
        primary_vendor_id: existing.primary_vendor_id,
        description: existing.description,
        min_qty: existing.min_qty,
        max_qty: existing.max_qty,
        reorder_qty: existing.reorder_qty,
        default_cost_egp: existing.default_cost_egp,
        currency: existing.currency,
        batch_tracked: existing.batch_tracked,
        expiry_tracked: existing.expiry_tracked,
        owner_billable: existing.owner_billable,
        is_asset: existing.is_asset,
        amazon_eg_url: existing.amazon_eg_url,
        photo_url: existing.photo_url,
      }
    : {
        sku: '',
        name_en: '',
        name_ar: '',
        category_id: categories[0]?.id || '',
        uom: 'pcs',
        brand: null,
        barcode: null,
        primary_vendor_id: null,
        description: null,
        min_qty: 0,
        max_qty: null,
        reorder_qty: null,
        default_cost_egp: 0,
        currency: 'EGP',
        batch_tracked: false,
        expiry_tracked: false,
        owner_billable: false,
        is_asset: false,
        amazon_eg_url: null,
        photo_url: null,
      };

  const [form, setForm] = useState<ItemFormInput>(initial);

  function update<K extends keyof ItemFormInput>(k: K, v: ItemFormInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // When category changes, auto-apply category defaults for batch/expiry
  function pickCategory(catId: string) {
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      setForm(f => ({
        ...f,
        category_id: catId,
        uom: f.uom || cat.default_uom,
        batch_tracked: f.batch_tracked || cat.default_batch_tracked,
        expiry_tracked: f.expiry_tracked || cat.default_expiry_tracked,
        is_asset: cat.is_asset,
      }));
    } else {
      update('category_id', catId);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = mode === 'edit' && existing
        ? await updateItemAction(existing.id, form)
        : await createItemAction(form);
      if (res.ok) {
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  async function handleToggleActive() {
    if (!existing) return;
    if (!confirm(`${existing.active ? 'Deactivate' : 'Activate'} item "${existing.name_en}"?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await toggleItemActiveAction(existing.id);
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl my-4">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--bh-navy)' }}>
                {mode === 'edit' ? `Edit ${existing?.name_en || 'item'}` : 'Add item'}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="SKU" required>
                  <input type="text" value={form.sku} onChange={e => update('sku', e.target.value)} required minLength={2} className="ix-input w-full font-mono" placeholder="CON-TR-FINE12" />
                </Field>
                <Field label="Brand">
                  <input type="text" value={form.brand || ''} onChange={e => update('brand', e.target.value || null)} className="ix-input w-full" placeholder="Fine" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Name (EN)" required>
                  <input type="text" value={form.name_en} onChange={e => update('name_en', e.target.value)} required className="ix-input w-full" />
                </Field>
                <Field label="الاسم (عربي)" required>
                  <input type="text" value={form.name_ar} onChange={e => update('name_ar', e.target.value)} required dir="rtl" className="ix-input w-full" />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Category" required>
                  <select value={form.category_id} onChange={e => pickCategory(e.target.value)} required className="ix-input w-full">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                  </select>
                </Field>
                <Field label="UoM" required>
                  <select value={form.uom} onChange={e => update('uom', e.target.value)} required className="ix-input w-full">
                    {uoms.map(u => <option key={u.code} value={u.code}>{u.code} — {u.name_en}</option>)}
                  </select>
                </Field>
                <Field label="Currency">
                  <select value={form.currency} onChange={e => update('currency', e.target.value as 'EGP' | 'USD')} className="ix-input w-full">
                    <option value="EGP">EGP</option>
                    <option value="USD">USD</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <Field label="Min qty">
                  <input type="number" min="0" step="0.01" value={form.min_qty} onChange={e => update('min_qty', parseFloat(e.target.value) || 0)} className="ix-input w-full" />
                </Field>
                <Field label="Max qty">
                  <input type="number" min="0" step="0.01" value={form.max_qty ?? ''} onChange={e => update('max_qty', e.target.value ? parseFloat(e.target.value) : null)} className="ix-input w-full" />
                </Field>
                <Field label="Reorder qty">
                  <input type="number" min="0" step="0.01" value={form.reorder_qty ?? ''} onChange={e => update('reorder_qty', e.target.value ? parseFloat(e.target.value) : null)} className="ix-input w-full" />
                </Field>
                <Field label={`Cost (${form.currency})`}>
                  <input type="number" min="0" step="0.01" value={form.default_cost_egp} onChange={e => update('default_cost_egp', parseFloat(e.target.value) || 0)} className="ix-input w-full" />
                </Field>
              </div>

              <Field label="Barcode">
                <input type="text" value={form.barcode || ''} onChange={e => update('barcode', e.target.value || null)} className="ix-input w-full font-mono" />
              </Field>

              <Field label="Amazon EG URL">
                <input type="url" value={form.amazon_eg_url || ''} onChange={e => update('amazon_eg_url', e.target.value || null)} className="ix-input w-full" placeholder="https://www.amazon.eg/dp/..." />
              </Field>

              <Field label="Description">
                <textarea value={form.description || ''} onChange={e => update('description', e.target.value || null)} rows={2} className="ix-input w-full" />
              </Field>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                <Toggle label="Batch tracked" value={form.batch_tracked} onChange={v => update('batch_tracked', v)} />
                <Toggle label="Expiry tracked" value={form.expiry_tracked} onChange={v => update('expiry_tracked', v)} />
                <Toggle label="Owner billable" value={form.owner_billable} onChange={v => update('owner_billable', v)} />
                <Toggle label="Asset (V2)" value={form.is_asset} onChange={v => update('is_asset', v)} />
              </div>

              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-[11px]">{error}</div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {mode === 'edit' && existing && (
                  <button type="button" onClick={handleToggleActive} disabled={pending}
                    className={`text-[11px] px-2 py-1 rounded ${existing.active ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'} disabled:opacity-50`}>
                    {existing.active ? 'Deactivate item' : 'Activate item'}
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</button>
                  <button type="submit" disabled={pending} className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                    {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create item'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] cursor-pointer">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="rounded" />
      <span className="text-slate-700">{label}</span>
    </label>
  );
}
