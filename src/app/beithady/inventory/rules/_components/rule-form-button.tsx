'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { FORMULA_KIND_LABEL, SCOPE_LABEL, type RuleScope, type FormulaKind, type ConsumptionRuleListRow } from '@/lib/beithady/inventory/rules-shared';
import { areUomsCompatible } from '@/lib/beithady/inventory/volumetric';
import { createRuleAction, updateRuleAction, type RuleFormInput } from '../actions';

type ItemOpt = {
  id: string;
  label: string;
  pack_volume_value: number | null;
  pack_volume_uom: string | null;
};
type BuildingOpt = { code: string; label: string };
type Mode = 'create' | 'edit';

const FORMULA_KEYS = Object.keys(FORMULA_KIND_LABEL) as FormulaKind[];
const SCOPE_KEYS = Object.keys(SCOPE_LABEL) as RuleScope[];

export function RuleFormButton({
  mode, existing, items, buildings, triggerLabel, triggerClass,
}: {
  mode: Mode;
  existing?: ConsumptionRuleListRow;
  items: ItemOpt[];
  buildings: BuildingOpt[];
  triggerLabel: ReactNode;
  triggerClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial: RuleFormInput = mode === 'edit' && existing
    ? {
        scope: existing.scope,
        scope_value: existing.scope_value,
        item_id: existing.item_id,
        formula_kind: existing.formula_kind,
        qty: existing.qty,
        loss_factor_pct: existing.loss_factor_pct,
        notes: existing.notes,
        consumes_volume_value: existing.consumes_volume_value,
        consumes_volume_uom: existing.consumes_volume_uom,
      }
    : {
        scope: 'global',
        scope_value: null,
        item_id: items[0]?.id || '',
        formula_kind: 'per_guest_per_night',
        qty: 1,
        loss_factor_pct: 12,
        notes: null,
        consumes_volume_value: null,
        consumes_volume_uom: null,
      };

  const [form, setForm] = useState<RuleFormInput>(initial);

  function update<K extends keyof RuleFormInput>(k: K, v: RuleFormInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // Q3 — auto-default consumes_volume_uom from the picked item's
  // pack_volume_uom, but only if the operator hasn't manually set one
  // for this rule already. For pure-count items (no pack_volume_uom),
  // default to 'pcs' per spec — operator gets a sensible starting UoM
  // without an extra click.
  function pickItem(itemId: string) {
    const item = items.find(i => i.id === itemId);
    setForm(f => ({
      ...f,
      item_id: itemId,
      consumes_volume_uom: f.consumes_volume_uom || item?.pack_volume_uom || 'pcs',
    }));
  }

  // useState(initial) only captures props on the FIRST mount. Re-sync on
  // open so the modal always reflects the latest `existing` row data
  // (e.g. after toggleRuleActiveAction or another admin's edit triggered
  // a server re-render). Mirrors the fix in item-form-button.tsx.
  function openModal() {
    setForm(initial);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Q3 — UoM compatibility check before save: rule consumption UoM must
    // be in the same dimensional family as item pack UoM (mass / volume /
    // count). Reject "100 kg" for a "4 L" item etc.
    if (form.consumes_volume_uom && form.item_id) {
      const item = items.find(i => i.id === form.item_id);
      if (item?.pack_volume_uom && !areUomsCompatible(form.consumes_volume_uom, item.pack_volume_uom)) {
        setError(
          `Rule UoM "${form.consumes_volume_uom}" is incompatible with item's pack UoM "${item.pack_volume_uom}". ` +
          `Pick a compatible UoM (same dimensional family — mass, volume, or count).`,
        );
        return;
      }
    }

    startTransition(async () => {
      const res = mode === 'edit' && existing
        ? await updateRuleAction(existing.id, form)
        : await createRuleAction(form);
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClass}>{triggerLabel}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-xl my-4">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--bh-navy)' }}>
                {mode === 'edit' ? 'Edit consumption rule' : 'Add consumption rule'}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <Field label="Item" required>
                <select value={form.item_id} onChange={e => pickItem(e.target.value)} required className="ix-input w-full">
                  <option value="">— Pick item —</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
                {(() => {
                  const it = items.find(i => i.id === form.item_id);
                  if (it?.pack_volume_value && it.pack_volume_uom) {
                    return (
                      <span className="block text-[10px] text-slate-400 mt-1">
                        Pack contents: {it.pack_volume_value} {it.pack_volume_uom} per pack — consumption UoM defaults to <code>{it.pack_volume_uom}</code> below.
                      </span>
                    );
                  }
                  return null;
                })()}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Scope" required>
                  <select value={form.scope} onChange={e => {
                    const newScope = e.target.value as RuleScope;
                    update('scope', newScope);
                    if (newScope === 'global') update('scope_value', null);
                  }} required className="ix-input w-full">
                    {SCOPE_KEYS.map(s => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                  </select>
                </Field>
                <Field label="Scope value" required={form.scope !== 'global'}>
                  {form.scope === 'global' ? (
                    <div className="ix-input w-full bg-slate-50 text-slate-400 italic text-[11px]">— (no value needed)</div>
                  ) : form.scope === 'building' ? (
                    <select value={form.scope_value || ''} onChange={e => update('scope_value', e.target.value || null)} required className="ix-input w-full">
                      <option value="">— Pick building —</option>
                      {buildings.map(b => <option key={b.code} value={b.code}>{b.code}</option>)}
                    </select>
                  ) : form.scope === 'listing' ? (
                    <input type="text" value={form.scope_value || ''} onChange={e => update('scope_value', e.target.value || null)} required placeholder="Guesty listing id" className="ix-input w-full font-mono" />
                  ) : (
                    <input type="text" value={form.scope_value || ''} onChange={e => update('scope_value', e.target.value || null)} required placeholder="Category code (consumables, linen, ...)" className="ix-input w-full font-mono" />
                  )}
                </Field>
              </div>

              <Field label="Formula" required>
                <select value={form.formula_kind} onChange={e => update('formula_kind', e.target.value as FormulaKind)} required className="ix-input w-full">
                  {FORMULA_KEYS.map(k => <option key={k} value={k}>{FORMULA_KIND_LABEL[k]}</option>)}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Base qty" required>
                  <input type="number" min="0.01" step="0.01" value={form.qty} onChange={e => update('qty', parseFloat(e.target.value) || 0)} required className="ix-input w-full text-right" />
                </Field>
                <Field label="Loss factor (%)">
                  <input type="number" min="0" max="100" step="0.1" value={form.loss_factor_pct} onChange={e => update('loss_factor_pct', parseFloat(e.target.value) || 0)} className="ix-input w-full text-right" />
                </Field>
              </div>

              {/* M.16 — base-unit consumption.
                  When operator sets BOTH consumes_volume_value/uom HERE and
                  the item has pack_volume_value/uom set, the estimator
                  computes units-per-trigger via UoM conversion (e.g.
                  "100 ml per check-in" ÷ "4 kg pack" = 0.025 packs).
                  Leave both blank to use the legacy raw-qty math above. */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 font-semibold mb-2">
                  Volumetric override (optional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 font-semibold mb-1">
                      Consumes (value)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.consumes_volume_value ?? ''}
                      onChange={e =>
                        update(
                          'consumes_volume_value',
                          e.target.value ? parseFloat(e.target.value) : null,
                        )
                      }
                      placeholder="e.g. 100 for 100 ml"
                      className="ix-input w-full text-right"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 font-semibold mb-1">
                      Consumes (UoM)
                    </span>
                    <select
                      value={form.consumes_volume_uom ?? ''}
                      onChange={e =>
                        update('consumes_volume_uom', e.target.value || null)
                      }
                      className="ix-input w-full"
                    >
                      <option value="">— None (legacy raw qty) —</option>
                      <optgroup label="Mass">
                        <option value="kg">kg (Kilogram)</option>
                        <option value="g">g (Gram)</option>
                      </optgroup>
                      <optgroup label="Volume">
                        <option value="L">L (Liter)</option>
                        <option value="ml">ml (Milliliter)</option>
                      </optgroup>
                      <optgroup label="Count">
                        <option value="pcs">pcs</option>
                        <option value="pack">pack</option>
                        <option value="sachet">sachet</option>
                      </optgroup>
                    </select>
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Set to override the count-based qty. Estimator divides by the
                  item&apos;s pack contents to compute accurate units-per-trigger
                  (e.g. 100 mL ÷ 4 L pack = 0.025 packs). Leave blank to skip.
                </p>
              </div>

              <div className="ix-card border-cyan-200 bg-cyan-50 p-2 text-[10px] text-cyan-900">
                <strong>Sample:</strong> for a 4-guest 5-night stay, this rule would issue&nbsp;
                <strong>{(() => {
                  let qty = form.qty;
                  switch (form.formula_kind) {
                    case 'per_guest_per_night': qty *= 4 * 5; break;
                    case 'per_night': qty *= 5; break;
                    case 'per_2_guests_per_night': qty *= Math.ceil(4 / 2) * 5; break;
                    case 'per_checkin':
                    case 'fixed_per_stay': break;
                  }
                  qty *= 1 + form.loss_factor_pct / 100;
                  return Math.ceil(qty * 100) / 100;
                })()}</strong> units.
              </div>

              <Field label="Notes">
                <textarea value={form.notes || ''} onChange={e => update('notes', e.target.value || null)} rows={2} className="ix-input w-full" placeholder="Why this rule? Source documentation?" />
              </Field>

              {error && <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-[11px]">{error}</div>}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                  {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create rule'}
                </button>
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
      <span className="block text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 font-semibold mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
