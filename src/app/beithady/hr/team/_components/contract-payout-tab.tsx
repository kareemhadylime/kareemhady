'use client';

import {
  BUILDING_CODES, BUILDING_LABELS, CONTRACT_TYPES, PAYMENT_METHODS,
  type ContractInput, type HrContract,
} from '@/lib/beithady/hr/hr-types';

type Props = {
  data: ContractInput;
  history: HrContract[];   // previous contract versions for salary history chips
  onChange: (patch: Partial<ContractInput>) => void;
};

export function ContractPayoutTab({ data, history, onChange }: Props) {
  const isFixedTerm = data.contract_type === 'fixed_term';

  return (
    <div className="space-y-5">
      {/* Contract type + start date */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contract Type *">
          <select className="ix-input" value={data.contract_type}
            onChange={e => onChange({ contract_type: e.target.value as ContractInput['contract_type'] })}>
            {CONTRACT_TYPES.map(t => (
              <option key={t} value={t}>
                {t === 'permanent' ? 'Permanent' : t === 'fixed_term' ? 'Fixed-term' : 'Hourly'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contract Start *">
          <input className="ix-input" type="date" value={data.contract_start}
            onChange={e => onChange({ contract_start: e.target.value })} />
        </Field>
      </div>

      {/* Contract end — only for fixed-term */}
      {isFixedTerm && (
        <Field label="Contract End">
          <input className="ix-input" type="date" value={data.contract_end}
            onChange={e => onChange({ contract_end: e.target.value })} />
        </Field>
      )}

      {/* Building / Cost Center */}
      <Field label="Building / Cost Center *">
        <select className="ix-input" value={data.building_code}
          onChange={e => onChange({ building_code: e.target.value as ContractInput['building_code'] })}>
          <option value="">— Select —</option>
          {BUILDING_CODES.map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b]}</option>
          ))}
        </select>
      </Field>

      {/* Salary with history chips */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Salary Package (EGP/mo) *
          </label>
          {history.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {history.slice(0, 3).map(c => (
                <span key={c.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                  {new Date(c.effective_from).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                  {' · '}
                  {Number(c.salary_package).toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </div>
        <input className="ix-input font-mono" type="number" min="0" step="500"
          value={data.salary_package}
          onChange={e => onChange({ salary_package: e.target.value })}
          placeholder="0" />
      </div>

      {/* Allowances row */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Transport (EGP)">
          <input className="ix-input font-mono" type="number" min="0" step="100"
            value={data.transport_allowance}
            onChange={e => onChange({ transport_allowance: e.target.value })}
            placeholder="0" />
        </Field>
        <Field label="Travel (EGP)">
          <input className="ix-input font-mono" type="number" min="0" step="100"
            value={data.travel_allowance}
            onChange={e => onChange({ travel_allowance: e.target.value })}
            placeholder="0" />
        </Field>
        <Field label="Fixed Bonus (EGP)">
          <input className="ix-input font-mono" type="number" min="0" step="100"
            value={data.fixed_bonus}
            onChange={e => onChange({ fixed_bonus: e.target.value })}
            placeholder="0" />
        </Field>
      </div>

      {/* Bank info section */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank Information</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank Name">
            <input className="ix-input" value={data.bank_name}
              onChange={e => onChange({ bank_name: e.target.value })}
              placeholder="e.g. CIB, NBE, QNB" />
          </Field>
          <Field label="Payment Method">
            <select className="ix-input" value={data.payment_method}
              onChange={e => onChange({ payment_method: e.target.value as ContractInput['payment_method'] })}>
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{m === 'bank' ? 'Bank Transfer' : 'Cash'}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Number">
            <input className="ix-input font-mono" value={data.bank_account}
              onChange={e => onChange({ bank_account: e.target.value })}
              placeholder="Account #" />
          </Field>
          <Field label="IBAN">
            <input className="ix-input font-mono" value={data.bank_iban}
              onChange={e => onChange({ bank_iban: e.target.value })}
              placeholder="EG..." />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
