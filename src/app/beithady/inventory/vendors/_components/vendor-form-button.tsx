'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { X, Building2 } from 'lucide-react';
import type { VendorRow, VendorCurrency } from '@/lib/beithady/inventory/vendors';
import type { Category } from '@/lib/beithady/inventory/catalog';
import { createVendorAction, updateVendorAction, type VendorFormInput } from '../actions';

type Mode = 'create' | 'edit';

export function VendorFormButton({
  mode, existing, categories, triggerLabel, triggerClass,
}: {
  mode: Mode;
  existing?: VendorRow;
  categories: Category[];
  triggerLabel: ReactNode;
  triggerClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial: VendorFormInput = mode === 'edit' && existing
    ? {
        code: existing.code,
        legal_name: existing.legal_name,
        trade_name: existing.trade_name,
        tax_id: existing.tax_id,
        commercial_reg_no: existing.commercial_reg_no,
        vat_no: existing.vat_no,
        payment_terms_days: existing.payment_terms_days,
        default_currency: existing.default_currency,
        contact_name: existing.contact_name,
        contact_phone: existing.contact_phone,
        contact_email: existing.contact_email,
        whatsapp_e164: existing.whatsapp_e164,
        address_line: existing.address_line,
        city: existing.city,
        country: existing.country,
        bank_name: existing.bank_name,
        bank_iban: existing.bank_iban,
        bank_account: existing.bank_account,
        amazon_eg_storefront_url: existing.amazon_eg_storefront_url,
        primary_categories: existing.primary_categories,
        notes: existing.notes,
      }
    : {
        code: '',
        legal_name: '',
        trade_name: null,
        tax_id: null,
        commercial_reg_no: null,
        vat_no: null,
        payment_terms_days: 30,
        default_currency: 'EGP',
        contact_name: null,
        contact_phone: null,
        contact_email: null,
        whatsapp_e164: null,
        address_line: null,
        city: null,
        country: 'Egypt',
        bank_name: null,
        bank_iban: null,
        bank_account: null,
        amazon_eg_storefront_url: null,
        primary_categories: [],
        notes: null,
      };

  const [form, setForm] = useState<VendorFormInput>(initial);

  function update<K extends keyof VendorFormInput>(k: K, v: VendorFormInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleCategory(code: string) {
    setForm(f => ({
      ...f,
      primary_categories: f.primary_categories.includes(code)
        ? f.primary_categories.filter(c => c !== code)
        : [...f.primary_categories, code],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = mode === 'edit' && existing
        ? await updateVendorAction(existing.id, form)
        : await createVendorAction(form);
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
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-3xl my-4">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
              <h3 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--bh-navy)' }}>
                <Building2 size={16} /> {mode === 'edit' ? `Edit ${existing?.legal_name || 'vendor'}` : 'Register vendor'}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              {/* Identity */}
              <Section title="Identity">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Vendor code" required>
                    <input type="text" value={form.code} onChange={e => update('code', e.target.value.toUpperCase())} required minLength={3} pattern="[A-Z0-9_-]+" className="ix-input w-full font-mono" placeholder="VEN-FINEPAPER" />
                  </Field>
                  <Field label="Legal name" required>
                    <input type="text" value={form.legal_name} onChange={e => update('legal_name', e.target.value)} required className="ix-input w-full" placeholder="Fine Hygienic Paper Co. SAE" />
                  </Field>
                  <Field label="Trade name">
                    <input type="text" value={form.trade_name || ''} onChange={e => update('trade_name', e.target.value || null)} className="ix-input w-full" placeholder="Fine" />
                  </Field>
                </div>
              </Section>

              {/* Legal / Tax */}
              <Section title="Legal & tax">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Tax ID">
                    <input type="text" value={form.tax_id || ''} onChange={e => update('tax_id', e.target.value || null)} className="ix-input w-full font-mono" />
                  </Field>
                  <Field label="Commercial reg #">
                    <input type="text" value={form.commercial_reg_no || ''} onChange={e => update('commercial_reg_no', e.target.value || null)} className="ix-input w-full font-mono" />
                  </Field>
                  <Field label="VAT #">
                    <input type="text" value={form.vat_no || ''} onChange={e => update('vat_no', e.target.value || null)} className="ix-input w-full font-mono" />
                  </Field>
                </div>
              </Section>

              {/* Commercial */}
              <Section title="Commercial">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Payment terms (days)">
                    <input type="number" min="0" max="180" value={form.payment_terms_days} onChange={e => update('payment_terms_days', parseInt(e.target.value, 10) || 0)} className="ix-input w-full" />
                  </Field>
                  <Field label="Default currency">
                    <select value={form.default_currency} onChange={e => update('default_currency', e.target.value as VendorCurrency)} className="ix-input w-full">
                      <option value="EGP">EGP</option>
                      <option value="USD">USD</option>
                      <option value="AED">AED</option>
                    </select>
                  </Field>
                  <Field label="Country">
                    <input type="text" value={form.country} onChange={e => update('country', e.target.value)} className="ix-input w-full" />
                  </Field>
                </div>
              </Section>

              {/* Contact */}
              <Section title="Contact">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact name">
                    <input type="text" value={form.contact_name || ''} onChange={e => update('contact_name', e.target.value || null)} className="ix-input w-full" />
                  </Field>
                  <Field label="Contact phone">
                    <input type="tel" value={form.contact_phone || ''} onChange={e => update('contact_phone', e.target.value || null)} className="ix-input w-full font-mono" placeholder="+20 12 ..." />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={form.contact_email || ''} onChange={e => update('contact_email', e.target.value || null)} className="ix-input w-full" />
                  </Field>
                  <Field label="WhatsApp (E.164)">
                    <input type="tel" value={form.whatsapp_e164 || ''} onChange={e => update('whatsapp_e164', e.target.value || null)} className="ix-input w-full font-mono" placeholder="+20122..." />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Address (street + bldg)">
                    <input type="text" value={form.address_line || ''} onChange={e => update('address_line', e.target.value || null)} className="ix-input w-full" />
                  </Field>
                  <Field label="City">
                    <input type="text" value={form.city || ''} onChange={e => update('city', e.target.value || null)} className="ix-input w-full" />
                  </Field>
                  <Field label="Amazon EG storefront URL">
                    <input type="url" value={form.amazon_eg_storefront_url || ''} onChange={e => update('amazon_eg_storefront_url', e.target.value || null)} className="ix-input w-full" placeholder="https://www.amazon.eg/sp?seller=..." />
                  </Field>
                </div>
              </Section>

              {/* Banking */}
              <Section title="Banking (encrypted at rest)">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Bank name">
                    <input type="text" value={form.bank_name || ''} onChange={e => update('bank_name', e.target.value || null)} className="ix-input w-full" />
                  </Field>
                  <Field label="IBAN">
                    <input type="text" value={form.bank_iban || ''} onChange={e => update('bank_iban', e.target.value || null)} className="ix-input w-full font-mono" />
                  </Field>
                  <Field label="Account #">
                    <input type="text" value={form.bank_account || ''} onChange={e => update('bank_account', e.target.value || null)} className="ix-input w-full font-mono" />
                  </Field>
                </div>
              </Section>

              {/* Categories */}
              <Section title="Primary categories supplied">
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => {
                    const on = form.primary_categories.includes(c.code);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => toggleCategory(c.code)}
                        className={`px-2 py-1 rounded text-[11px] border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                      >
                        {c.name_en}
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Field label="Notes">
                <textarea value={form.notes || ''} onChange={e => update('notes', e.target.value || null)} rows={2} className="ix-input w-full" />
              </Field>

              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-[11px]">{error}</div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancel</button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                  {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Register vendor (status = draft)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{title}</legend>
      {children}
    </fieldset>
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
