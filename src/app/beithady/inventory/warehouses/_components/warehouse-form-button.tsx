'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { WarehouseRow } from '@/lib/beithady/inventory/warehouses-shared';
import {
  BEITHADY_BUILDING_CODES,
  CATEGORY_TAG_LABEL,
} from '@/lib/beithady/inventory/warehouses-shared';
import { createWarehouseAction, updateWarehouseAction, type WarehouseFormInput } from '../actions';

type ParentOption = { id: string; code: string; name_en: string; building_code: string | null };

type Mode = 'create' | 'edit' | 'create_sub';

const CATEGORY_KEYS = Object.keys(CATEGORY_TAG_LABEL) as Array<NonNullable<WarehouseRow['category_tag']>>;

export function WarehouseFormButton({
  mode,
  existing,
  parentId,
  parentBuildingCode,
  triggerLabel,
  triggerClass,
  allMains,
}: {
  mode: Mode;
  existing?: WarehouseRow;
  parentId?: string;
  parentBuildingCode?: string | null;
  triggerLabel: ReactNode;
  triggerClass: string;
  allMains: ParentOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial: WarehouseFormInput = mode === 'edit' && existing
    ? {
        code: existing.code,
        name_en: existing.name_en,
        name_ar: existing.name_ar,
        building_code: existing.building_code || '',
        parent_id: existing.parent_id,
        category_tag: existing.category_tag,
        manager_user_id: existing.manager_user_id,
        address_line: existing.address_line,
        notes: existing.notes,
      }
    : mode === 'create_sub' && parentId
      ? {
          code: '',
          name_en: '',
          name_ar: '',
          building_code: parentBuildingCode || '',
          parent_id: parentId,
          category_tag: 'general',
          manager_user_id: null,
          address_line: null,
          notes: null,
        }
      : {
          code: '',
          name_en: '',
          name_ar: '',
          building_code: 'BH-26',
          parent_id: null,
          category_tag: 'general',
          manager_user_id: null,
          address_line: null,
          notes: null,
        };

  const [form, setForm] = useState<WarehouseFormInput>(initial);

  function reset() {
    setForm(initial);
    setError(null);
  }

  // useState(initial) only captures props on the FIRST mount, and reset()
  // was previously only called on cancel/close/post-submit — so reopening
  // an Edit modal after a server-side rename or a sibling tree edit
  // displayed stale data. Re-sync on open. Mirrors item-form-button.tsx.
  function openModal() {
    reset();
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = mode === 'edit' && existing
        ? await updateWarehouseAction(existing.id, form)
        : await createWarehouseAction(form);
      if (res.ok) {
        setOpen(false);
        reset();
      } else {
        setError(res.error);
      }
    });
  }

  // Filter parent options by selected building (UX guardrail; the
  // server allows cross-building parents, but visually it's confusing).
  const parentChoices = allMains.filter(m =>
    !form.building_code || m.building_code === form.building_code,
  ).filter(m => !existing || m.id !== existing.id);

  const title = mode === 'edit'
    ? `Edit ${existing?.name_en || 'warehouse'}`
    : mode === 'create_sub'
      ? 'Add sub-warehouse'
      : 'Add warehouse';

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClass}>
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-xl">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--bh-navy)' }}>{title}</h3>
              <button
                type="button"
                onClick={() => { setOpen(false); reset(); }}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code (UPPERCASE)" required>
                  <input
                    type="text"
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="WH-BH26-LINEN"
                    className="ix-input w-full font-mono"
                    required
                    pattern="[A-Z0-9_-]+"
                    minLength={3}
                  />
                </Field>
                <Field label="Building" required>
                  <select
                    value={form.building_code}
                    onChange={e => setForm(f => ({ ...f, building_code: e.target.value, parent_id: null }))}
                    className="ix-input w-full"
                    required
                  >
                    {BEITHADY_BUILDING_CODES.map(bc => (
                      <option key={bc} value={bc}>{bc}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Name (EN)" required>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
                    className="ix-input w-full"
                    required
                  />
                </Field>
                <Field label="الاسم (عربي)" required>
                  <input
                    type="text"
                    value={form.name_ar}
                    onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                    dir="rtl"
                    className="ix-input w-full"
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category tag">
                  <select
                    value={form.category_tag || 'general'}
                    onChange={e => setForm(f => ({ ...f, category_tag: e.target.value as WarehouseRow['category_tag'] }))}
                    className="ix-input w-full"
                  >
                    {CATEGORY_KEYS.map(k => (
                      <option key={k} value={k}>{CATEGORY_TAG_LABEL[k].en}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Parent warehouse (for sub)">
                  <select
                    value={form.parent_id || ''}
                    onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}
                    className="ix-input w-full"
                  >
                    <option value="">— None (top-level)</option>
                    {parentChoices.map(p => (
                      <option key={p.id} value={p.id}>{p.name_en} ({p.code})</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Manager user ID (optional)">
                <input
                  type="text"
                  value={form.manager_user_id || ''}
                  onChange={e => setForm(f => ({ ...f, manager_user_id: e.target.value || null }))}
                  placeholder="UUID or short identifier"
                  className="ix-input w-full"
                />
              </Field>

              <Field label="Address (optional)">
                <input
                  type="text"
                  value={form.address_line || ''}
                  onChange={e => setForm(f => ({ ...f, address_line: e.target.value || null }))}
                  className="ix-input w-full"
                />
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                  rows={2}
                  className="ix-input w-full"
                />
              </Field>

              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-[11px]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setOpen(false); reset(); }}
                  className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
