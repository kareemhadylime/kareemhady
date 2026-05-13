# Beithady HR — Team Members (Part 2: UI Components) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.
> **Prerequisite:** Part 1 must be complete and all commits from Part 1 must exist before starting here.

**Goal:** Build all UI components — status badge, timeline tab, form tabs (Personal Info / Contract & Payout), Add/Edit dialog, XLSX import parser + dialog, team roster, and the team page that wires it all together.

**Architecture:** All components under `src/app/beithady/hr/team/_components/`. Server actions from Part 1 are called from client components via `startTransition`. No Radix UI — custom slide-over following `BottomSheet.tsx` pattern.

**Tech Stack:** React 19 · Tailwind v4 · exceljs (XLSX parsing) · lucide-react

---

## File Map

| Status | Path | Purpose |
|---|---|---|
| **Create** | `src/app/beithady/hr/team/_components/status-badge.tsx` | Colored status pill |
| **Create** | `src/app/beithady/hr/team/_components/timeline-tab.tsx` | Read-only audit log |
| **Create** | `src/app/beithady/hr/team/_components/personal-info-tab.tsx` | Tab 1 form |
| **Create** | `src/app/beithady/hr/team/_components/contract-payout-tab.tsx` | Tab 2 form |
| **Create** | `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` | Slide-over, wires 3 tabs |
| **Create** | `src/lib/beithady/hr/hr-import.ts` | exceljs parse + validation |
| **Create** | `src/lib/beithady/hr/hr-import.test.ts` | Vitest unit tests |
| **Create** | `src/lib/beithady/hr/hr-actions.ts` | Add `importEmployeesAction` (append to Part 1 file) |
| **Create** | `src/app/beithady/hr/team/_components/import-dialog.tsx` | 3-step wizard |
| **Create** | `src/app/beithady/hr/team/_components/team-roster.tsx` | Client table + search/filter |
| **Create** | `src/app/beithady/hr/team/page.tsx` | Server component, wires all |

---

## Task 10: Status Badge

**Files:**
- Create: `src/app/beithady/hr/team/_components/status-badge.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/beithady/hr/team/_components/status-badge.tsx
import type { EmployeeStatus } from '@/lib/beithady/hr/hr-types';
import { STATUS_LABELS } from '@/lib/beithady/hr/hr-types';

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  on_job:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  probation:  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  on_leave:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  suspended:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  terminated: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/hr/team/_components/status-badge.tsx
git commit -m "feat(hr): StatusBadge component — 5 status colors"
```

---

## Task 11: Timeline Tab

**Files:**
- Create: `src/app/beithady/hr/team/_components/timeline-tab.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/beithady/hr/team/_components/timeline-tab.tsx
'use client';

import { UserPlus, TrendingUp, Building2, DollarSign, UserX, RefreshCw } from 'lucide-react';
import type { HrEvent, EventType } from '@/lib/beithady/hr/hr-types';

const EVENT_CONFIG: Record<EventType, { icon: React.ElementType; color: string; label: string }> = {
  hired:             { icon: UserPlus,    color: 'text-emerald-500', label: 'Hired' },
  status_change:     { icon: RefreshCw,   color: 'text-blue-500',    label: 'Status Changed' },
  salary_change:     { icon: DollarSign,  color: 'text-amber-500',   label: 'Salary Updated' },
  building_transfer: { icon: Building2,   color: 'text-violet-500',  label: 'Transferred' },
  role_change:       { icon: TrendingUp,  color: 'text-cyan-500',    label: 'Role Changed' },
  terminated:        { icon: UserX,       color: 'text-red-500',     label: 'Terminated' },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function TimelineTab({ events }: { events: HrEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        No timeline events yet.
      </div>
    );
  }

  return (
    <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-3 space-y-6">
      {events.map(ev => {
        const cfg = EVENT_CONFIG[ev.event_type];
        const Icon = cfg.icon;
        return (
          <li key={ev.id} className="ml-6">
            <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-slate-900 ring-2 ring-slate-200 dark:ring-slate-700`}>
              <Icon size={12} className={cfg.color} />
            </span>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {cfg.label}
                </p>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                  {ev.description}
                </p>
              </div>
              <time className="text-xs text-slate-400 whitespace-nowrap">
                {fmt(ev.event_date)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/hr/team/_components/timeline-tab.tsx
git commit -m "feat(hr): TimelineTab — read-only audit log with event icons"
```

---

## Task 12: Personal Info Tab

**Files:**
- Create: `src/app/beithady/hr/team/_components/personal-info-tab.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/beithady/hr/team/_components/personal-info-tab.tsx
'use client';

import { useRef } from 'react';
import { Upload, User } from 'lucide-react';
import { parseEgyptianNid } from '@/lib/beithady/hr/hr-nid';
import {
  DEPARTMENTS, DEPARTMENT_LABELS, JOB_ROLES, JOB_ROLE_LABELS,
  EMPLOYEE_STATUSES, STATUS_LABELS,
  type PersonalInfoInput,
} from '@/lib/beithady/hr/hr-types';

type Props = {
  data: PersonalInfoInput;
  companyId: string;          // read-only display
  onChange: (patch: Partial<PersonalInfoInput>) => void;
  onPhotoUpload: (file: File) => Promise<void>;
  uploading: boolean;
};

export function PersonalInfoTab({ data, companyId, onChange, onPhotoUpload, uploading }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleNidBlur() {
    const parsed = parseEgyptianNid(data.national_id);
    if (parsed) {
      onChange({ date_of_birth: parsed.dateOfBirth, gender: parsed.gender });
    }
  }

  const isTerminated = data.status === 'terminated';

  return (
    <div className="space-y-5">
      {/* Portrait */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Portrait Photo <span className="font-normal normal-case">(max 100 KB)</span>
        </label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
            {data.portrait_url
              ? <img src={data.portrait_url} alt="Portrait" className="w-full h-full object-cover" />
              : <User size={28} className="text-slate-400" />
            }
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { if (e.target.files?.[0]) onPhotoUpload(e.target.files[0]); }} />
          <button type="button" disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2">
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Choose Photo'}
          </button>
        </div>
      </div>

      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name *">
          <input className="ix-input" value={data.first_name}
            onChange={e => onChange({ first_name: e.target.value })}
            placeholder="First name" required />
        </Field>
        <Field label="Last Name">
          <input className="ix-input" value={data.last_name}
            onChange={e => onChange({ last_name: e.target.value })}
            placeholder="Last name" />
        </Field>
      </div>

      {/* Arabic name */}
      <Field label="الاسم بالعربي — Arabic Name (searchable)">
        <input className="ix-input text-right" dir="rtl" value={data.arabic_name}
          onChange={e => onChange({ arabic_name: e.target.value })}
          placeholder="أدخل الاسم بالعربي" />
      </Field>

      {/* NID + DOB row */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="National ID * (14 digits)">
          <input className="ix-input font-mono" value={data.national_id}
            onChange={e => onChange({ national_id: e.target.value })}
            onBlur={handleNidBlur}
            placeholder="14 digits" maxLength={14} />
        </Field>
        <Field label="Date of Birth *">
          <input className="ix-input" type="date" value={data.date_of_birth}
            onChange={e => onChange({ date_of_birth: e.target.value })} />
        </Field>
      </div>

      {/* Gender chip (auto-filled, read-only) */}
      {data.gender && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Gender auto-detected:</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            data.gender === 'male'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
          }`}>
            {data.gender === 'male' ? '♂ Male' : '♀ Female'}
          </span>
        </div>
      )}

      {/* Department + Position */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department *">
          <select className="ix-input" value={data.department}
            onChange={e => onChange({ department: e.target.value as PersonalInfoInput['department'] })}>
            <option value="">— Select —</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
            ))}
          </select>
        </Field>
        <Field label="Position *">
          <input className="ix-input" value={data.position}
            onChange={e => onChange({ position: e.target.value })}
            placeholder="Job title" />
        </Field>
      </div>

      {/* Job Role + Status */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job Role *">
          <select className="ix-input" value={data.job_role}
            onChange={e => onChange({ job_role: e.target.value as PersonalInfoInput['job_role'] })}>
            <option value="">— Select —</option>
            {JOB_ROLES.map(r => (
              <option key={r} value={r}>{JOB_ROLE_LABELS[r]}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="ix-input" value={data.status}
            onChange={e => onChange({ status: e.target.value as PersonalInfoInput['status'] })}>
            {EMPLOYEE_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Termination fields (conditional) */}
      {isTerminated && (
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
          <Field label="Date Terminated">
            <input className="ix-input" type="date" value={data.date_terminated}
              onChange={e => onChange({ date_terminated: e.target.value })} />
          </Field>
          <Field label="Termination Reason">
            <input className="ix-input" value={data.termination_reason}
              onChange={e => onChange({ termination_reason: e.target.value })}
              placeholder="Optional reason" />
          </Field>
        </div>
      )}

      {/* Date Joined + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date Joined *">
          <input className="ix-input" type="date" value={data.date_joined}
            onChange={e => onChange({ date_joined: e.target.value })} />
        </Field>
        <Field label="Phone *">
          <input className="ix-input" value={data.phone}
            onChange={e => onChange({ phone: e.target.value })}
            placeholder="+20100XXXXXXX" />
        </Field>
      </div>

      {/* Email */}
      <Field label="Email">
        <input className="ix-input" type="email" value={data.email}
          onChange={e => onChange({ email: e.target.value })}
          placeholder="email@..." />
      </Field>

      {/* Company ID */}
      <Field label="Company ID (auto-generated)">
        <div className="ix-input bg-slate-50 dark:bg-slate-900 font-mono text-amber-600 dark:text-amber-400 cursor-default select-all">
          {companyId || 'BH-???'}
        </div>
      </Field>
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep personal-info
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/team/_components/personal-info-tab.tsx
git commit -m "feat(hr): PersonalInfoTab — NID auto-fill, bilingual name, conditional termination fields"
```

---

## Task 13: Contract & Payout Tab

**Files:**
- Create: `src/app/beithady/hr/team/_components/contract-payout-tab.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/beithady/hr/team/_components/contract-payout-tab.tsx
'use client';

import {
  BUILDING_CODES, BUILDING_LABELS, CONTRACT_TYPES, PAYMENT_METHODS,
  type ContractInput, type HrContract,
} from '@/lib/beithady/hr/hr-types';

type Props = {
  data: ContractInput;
  history: HrContract[];
  onChange: (patch: Partial<ContractInput>) => void;
};

export function ContractPayoutTab({ data, history, onChange }: Props) {
  const isFixedTerm = data.contract_type === 'fixed_term';

  return (
    <div className="space-y-5">
      {/* Contract type + dates */}
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

      {isFixedTerm && (
        <Field label="Contract End">
          <input className="ix-input" type="date" value={data.contract_end}
            onChange={e => onChange({ contract_end: e.target.value })} />
        </Field>
      )}

      {/* Building */}
      <Field label="Building / Cost Center *">
        <select className="ix-input" value={data.building_code}
          onChange={e => onChange({ building_code: e.target.value as ContractInput['building_code'] })}>
          <option value="">— Select —</option>
          {BUILDING_CODES.map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b]}</option>
          ))}
        </select>
      </Field>

      {/* Salary */}
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

      {/* Bank info */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/beithady/hr/team/_components/contract-payout-tab.tsx
git commit -m "feat(hr): ContractPayoutTab — contract type, building, salary + allowances, bank info"
```

---

## Task 14: Add/Edit Member Dialog

**Files:**
- Create: `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx
'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { addEmployeeAction, editEmployeeAction } from '@/lib/beithady/hr/hr-actions';
import type { HrEmployeeRow, PersonalInfoInput, ContractInput } from '@/lib/beithady/hr/hr-types';
import { PersonalInfoTab } from './personal-info-tab';
import { ContractPayoutTab } from './contract-payout-tab';
import { TimelineTab } from './timeline-tab';
import type { HrEvent } from '@/lib/beithady/hr/hr-types';

type Tab = 'personal' | 'contract' | 'timeline';

type Props = {
  open: boolean;
  onClose: () => void;
  employee?: HrEmployeeRow;   // undefined = Add mode
  events?: HrEvent[];
};

function emptyPersonal(): PersonalInfoInput {
  return {
    first_name: '', last_name: '', arabic_name: '', national_id: '',
    date_of_birth: '', gender: '', department: '', position: '',
    job_role: '', status: 'on_job', date_joined: '', date_terminated: '',
    termination_reason: '', phone: '', email: '', portrait_url: '',
  };
}

function emptyContract(): ContractInput {
  return {
    contract_type: 'permanent', contract_start: '', contract_end: '',
    building_code: '', salary_package: '', transport_allowance: '0',
    travel_allowance: '0', fixed_bonus: '0', bank_name: '',
    bank_account: '', bank_iban: '', payment_method: 'bank',
  };
}

function employeeToPersonal(emp: HrEmployeeRow): PersonalInfoInput {
  return {
    first_name:         emp.first_name,
    last_name:          emp.last_name ?? '',
    arabic_name:        emp.arabic_name ?? '',
    national_id:        emp.national_id ?? '',
    date_of_birth:      emp.date_of_birth ?? '',
    gender:             emp.gender ?? '',
    department:         emp.department,
    position:           emp.position,
    job_role:           emp.job_role,
    status:             emp.status,
    date_joined:        emp.date_joined ?? '',
    date_terminated:    emp.date_terminated ?? '',
    termination_reason: emp.termination_reason ?? '',
    phone:              emp.phone ?? '',
    email:              emp.email ?? '',
    portrait_url:       emp.portrait_url ?? '',
  };
}

function contractToInput(c: HrEmployeeRow['current_contract']): ContractInput {
  if (!c) return emptyContract();
  return {
    contract_type:       c.contract_type,
    contract_start:      c.contract_start,
    contract_end:        c.contract_end ?? '',
    building_code:       c.building_code,
    salary_package:      String(c.salary_package),
    transport_allowance: String(c.transport_allowance),
    travel_allowance:    String(c.travel_allowance),
    fixed_bonus:         String(c.fixed_bonus),
    bank_name:           c.bank_name ?? '',
    bank_account:        c.bank_account ?? '',
    bank_iban:           c.bank_iban ?? '',
    payment_method:      c.payment_method,
  };
}

export function AddEditMemberDialog({ open, onClose, employee, events = [] }: Props) {
  const isEdit = !!employee;
  const [tab, setTab] = useState<Tab>('personal');
  const [personal, setPersonal] = useState<PersonalInfoInput>(
    employee ? employeeToPersonal(employee) : emptyPersonal()
  );
  const [contract, setContract] = useState<ContractInput>(
    employee ? contractToInput(employee.current_contract) : emptyContract()
  );
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset when employee changes (dialog re-used for different rows)
  useEffect(() => {
    if (open) {
      setPersonal(employee ? employeeToPersonal(employee) : emptyPersonal());
      setContract(employee ? contractToInput(employee.current_contract) : emptyContract());
      setTab('personal');
      setError('');
    }
  }, [open, employee]);

  // ESC + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handlePhotoUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/hr/upload-photo', { method: 'POST', body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (json.error) { setError(json.error); return; }
      if (json.url) setPersonal(p => ({ ...p, portrait_url: json.url! }));
    } catch {
      setError('Photo upload failed');
    } finally {
      setUploading(false);
    }
  }, []);

  function handleSubmit() {
    if (!personal.first_name.trim()) { setError('First name is required'); setTab('personal'); return; }
    if (!personal.department) { setError('Department is required'); setTab('personal'); return; }
    if (!personal.position.trim()) { setError('Position is required'); setTab('personal'); return; }
    if (!personal.job_role) { setError('Job role is required'); setTab('personal'); return; }
    if (!contract.building_code) { setError('Building is required'); setTab('contract'); return; }

    setError('');
    startTransition(async () => {
      let result: { id?: string; error?: string };
      if (isEdit && employee) {
        result = await editEmployeeAction(
          employee.id,
          personal,
          contract,
          employee.current_contract
            ? { salary_package: employee.current_contract.salary_package, building_code: employee.current_contract.building_code }
            : null
        );
      } else {
        result = await addEmployeeAction(personal, contract);
      }
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  if (!open) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'personal', label: '👤 Personal Info' },
    { id: 'contract', label: '📄 Contract & Payout' },
    { id: 'timeline', label: '📅 Timeline' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isEdit ? 'Edit Team Member' : 'Add Team Member'}
            </h2>
            {isEdit && employee && (
              <p className="text-xs text-slate-500 mt-0.5">{employee.company_id}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 px-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'personal' && (
            <PersonalInfoTab
              data={personal}
              companyId={employee?.company_id ?? 'BH-???'}
              onChange={patch => setPersonal(p => ({ ...p, ...patch }))}
              onPhotoUpload={handlePhotoUpload}
              uploading={uploading}
            />
          )}
          {tab === 'contract' && (
            <ContractPayoutTab
              data={contract}
              history={employee?.contract_history ?? []}
              onChange={patch => setContract(c => ({ ...c, ...patch }))}
            />
          )}
          {tab === 'timeline' && (
            <TimelineTab events={events} />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between gap-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400 flex-1">{error}</p>}
          {!error && <span />}
          <div className="flex gap-3">
            <button onClick={onClose} type="button"
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={isPending || uploading} type="button"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep add-edit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx
git commit -m "feat(hr): AddEditMemberDialog — 3-tab slide-over, NID auto-fill, photo upload, server action"
```

---

## Task 15: XLSX Import Parser (TDD)

**Files:**
- Create: `src/lib/beithady/hr/hr-import.ts`
- Create: `src/lib/beithady/hr/hr-import.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/beithady/hr/hr-import.test.ts
import { describe, it, expect } from 'vitest';
import { mapAnalyticToBuilding, inferStatus, validateRow } from './hr-import';
import type { ImportRow } from './hr-types';

describe('mapAnalyticToBuilding', () => {
  it('maps Lotus 26 → BH-26', () => {
    expect(mapAnalyticToBuilding('Lotus 26')).toBe('BH-26');
  });
  it('maps LOTUS 73 → BH-73 (case insensitive)', () => {
    expect(mapAnalyticToBuilding('LOTUS 73')).toBe('BH-73');
  });
  it('maps A1 Hospitality → BH-435', () => {
    expect(mapAnalyticToBuilding('A1 Hospitality')).toBe('BH-435');
  });
  it('maps a1 hospitality → BH-435 (lowercase)', () => {
    expect(mapAnalyticToBuilding('a1 hospitality')).toBe('BH-435');
  });
  it('maps One kattameya → BH-OK', () => {
    expect(mapAnalyticToBuilding('One kattameya')).toBe('BH-OK');
  });
  it('maps Head Office → HEAD_OFFICE', () => {
    expect(mapAnalyticToBuilding('Head Office')).toBe('HEAD_OFFICE');
  });
  it('maps El-Gona → OTHER', () => {
    expect(mapAnalyticToBuilding('El-Gona')).toBe('OTHER');
  });
  it('returns null for unknown value', () => {
    expect(mapAnalyticToBuilding('Dubai Branch')).toBeNull();
  });
});

describe('inferStatus', () => {
  it('returns terminated when isRedRow=true', () => {
    expect(inferStatus(true)).toBe('terminated');
  });
  it('returns on_job when isRedRow=false', () => {
    expect(inferStatus(false)).toBe('on_job');
  });
});

describe('validateRow', () => {
  const base: ImportRow = {
    rowIndex: 1,
    first_name: 'Mohamed Ali',
    position: 'Engineer',
    salary_package: 11500,
    building_code: 'BH-26',
    transport_allowance: 0,
    fixed_bonus: 0,
    status: 'on_job',
    validationState: 'ready',
    errors: [],
    incompleteFields: [],
    isRedRow: false,
  };

  it('marks ready row as ready', () => {
    const result = validateRow(base);
    expect(result.validationState).toBe('ready');
    expect(result.errors).toHaveLength(0);
  });

  it('marks missing first_name as error', () => {
    const result = validateRow({ ...base, first_name: '' });
    expect(result.validationState).toBe('error');
    expect(result.errors).toContain('Name is required');
  });

  it('marks null building_code as incomplete', () => {
    const result = validateRow({ ...base, building_code: null });
    expect(result.validationState).toBe('incomplete');
    expect(result.incompleteFields).toContain('building_code');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- hr-import
```
Expected: module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/beithady/hr/hr-import.ts
import type { ImportRow, ImportPreviewResult, BuildingCode, EmployeeStatus } from './hr-types';

// ── Analytic → BuildingCode mapping ───────────────────────────────────────

const ANALYTIC_MAP: [RegExp, BuildingCode | 'OTHER'][] = [
  [/lotus\s*26/i,        'BH-26'],
  [/lotus\s*73/i,        'BH-73'],
  [/a1\s*hospitality/i,  'BH-435'],
  [/one\s*katt?ameya/i,  'BH-OK'],
  [/head\s*office/i,     'HEAD_OFFICE'],
  [/el[- ]?go[nu]a/i,    'OTHER'],
];

export function mapAnalyticToBuilding(analytic: string): BuildingCode | null {
  const s = analytic.trim();
  for (const [re, code] of ANALYTIC_MAP) {
    if (re.test(s)) return code as BuildingCode;
  }
  return null;
}

// ── Red-row detection ─────────────────────────────────────────────────────

export function isRedFill(argb: string): boolean {
  // ARGB hex: AA RR GG BB
  if (argb.length < 8) return false;
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  return r > 180 && g < 100 && b < 100;
}

// ── Status inference ──────────────────────────────────────────────────────

export function inferStatus(isRedRow: boolean): EmployeeStatus {
  return isRedRow ? 'terminated' : 'on_job';
}

// ── Row validation ────────────────────────────────────────────────────────

export function validateRow(row: ImportRow): ImportRow {
  const errors: string[] = [];
  const incompleteFields: string[] = [];

  if (!row.first_name.trim()) errors.push('Name is required');
  if (!row.position.trim()) incompleteFields.push('position');
  if (!row.building_code) incompleteFields.push('building_code');
  if (row.salary_package < 0) errors.push('Salary must be ≥ 0');

  let validationState: ImportRow['validationState'] = 'ready';
  if (errors.length > 0) validationState = 'error';
  else if (incompleteFields.length > 0) validationState = 'incomplete';

  return { ...row, errors, incompleteFields, validationState };
}

// ── XLSX parsing ──────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
  return String(v).trim();
}

/**
 * Parse an XLSX file buffer (from April salary sheet format).
 * Uses exceljs to read cell values and background fill colors.
 *
 * Expected columns (order flexible, header row detected by "Name" presence):
 *   Name, JobTitle, S.Package, OT, Transportation Allowance, Bonus, Analytic
 *
 * Returns ImportPreviewResult for display in the import dialog.
 */
export async function parseImportFile(buffer: ArrayBuffer): Promise<ImportPreviewResult> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file');

  // Find header row (first row containing "Name")
  let headerRowNum = -1;
  const colIndex: Record<string, number> = {};

  sheet.eachRow((row, rowNum) => {
    if (headerRowNum !== -1) return;
    const vals = row.values as unknown[];
    const lower = vals.map(v => safeStr(v).toLowerCase());
    if (lower.some(v => v === 'name')) {
      headerRowNum = rowNum;
      lower.forEach((v, i) => {
        if (v === 'name')                    colIndex.name = i;
        if (v === 'jobtitle' || v === 'job title') colIndex.jobTitle = i;
        if (v.includes('s.pack') || v === 'salary package') colIndex.sPackage = i;
        if (v.includes('transport'))         colIndex.transport = i;
        if (v === 'bonus')                   colIndex.bonus = i;
        if (v === 'analytic')                colIndex.analytic = i;
      });
    }
  });

  if (headerRowNum === -1) throw new Error('Could not find header row — expected a row with "Name" column');

  const rows: ImportRow[] = [];

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const vals = row.values as unknown[];
    const name = safeStr(vals[colIndex.name ?? 1]);
    if (!name) return; // Skip blank rows

    // Detect red background
    let redRow = false;
    for (let c = 1; c <= Math.min(row.cellCount, 3); c++) {
      const fill = row.getCell(c).fill;
      if (fill && fill.type === 'pattern' && 'fgColor' in fill && fill.fgColor?.argb) {
        if (isRedFill(fill.fgColor.argb)) { redRow = true; break; }
      }
    }

    const analytic = safeStr(vals[colIndex.analytic ?? 0]);
    const buildingCode = mapAnalyticToBuilding(analytic);

    const raw: ImportRow = {
      rowIndex: rowNum,
      first_name: name,
      position: safeStr(vals[colIndex.jobTitle ?? 0]),
      salary_package: safeNum(vals[colIndex.sPackage ?? 0]),
      building_code: buildingCode,
      transport_allowance: safeNum(vals[colIndex.transport ?? 0]),
      fixed_bonus: safeNum(vals[colIndex.bonus ?? 0]),
      status: inferStatus(redRow),
      isRedRow: redRow,
      validationState: 'ready',
      errors: [],
      incompleteFields: [],
    };

    rows.push(validateRow(raw));
  });

  return {
    rows,
    readyCount: rows.filter(r => r.validationState === 'ready').length,
    incompleteCount: rows.filter(r => r.validationState === 'incomplete').length,
    errorCount: rows.filter(r => r.validationState === 'error').length,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- hr-import
```
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hr/hr-import.ts src/lib/beithady/hr/hr-import.test.ts
git commit -m "feat(hr): XLSX import parser — analytic→building mapping, red-row detection, validation + tests"
```

---

## Task 16: Import Server Action + Import Dialog

**Files:**
- Modify: `src/lib/beithady/hr/hr-actions.ts` (append `importEmployeesAction`)
- Create: `src/app/beithady/hr/team/_components/import-dialog.tsx`

- [ ] **Step 1: Append to hr-actions.ts**

Add this function at the end of `src/lib/beithady/hr/hr-actions.ts`:

```typescript
// ── importEmployees ───────────────────────────────────────────────────────

import type { ImportRow } from './hr-types';

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: { rowIndex: number; name: string; error: string }[];
};

export async function importEmployeesAction(rows: ImportRow[]): Promise<ImportResult> {
  const user = await requireHrAccess();
  const sb = supabaseAdmin();
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    if (row.validationState === 'error') { result.skipped++; continue; }

    try {
      const companyId = await generateCompanyId();
      const incompleteFields: string[] = [
        ...row.incompleteFields,
        'national_id', 'phone', 'date_of_birth', 'date_joined',
      ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

      const { data: emp, error: empErr } = await sb
        .from('hr_employees')
        .insert({
          company_id:        companyId,
          first_name:        row.first_name,
          last_name:         null,
          department:        'housekeeping',   // default; user updates via Edit
          position:          row.position || 'Staff',
          job_role:          'housekeeper',    // default; user updates via Edit
          status:            row.status,
          incomplete_fields: incompleteFields,
          created_by:        user.id,
        })
        .select('id')
        .single();

      if (empErr) {
        result.errors.push({ rowIndex: row.rowIndex, name: row.first_name, error: empErr.message });
        continue;
      }

      const employeeId = emp.id as string;
      const today = new Date().toISOString().slice(0, 10);

      if (row.building_code) {
        await sb.from('hr_employee_contracts').insert({
          employee_id:         employeeId,
          contract_type:       'permanent',
          contract_start:      today,
          building_code:       row.building_code,
          salary_package:      row.salary_package,
          transport_allowance: row.transport_allowance,
          travel_allowance:    0,
          fixed_bonus:         row.fixed_bonus,
          payment_method:      'bank',
          effective_from:      today,
          effective_to:        null,
          created_by:          user.id,
        });
      }

      await sb.from('hr_employee_events').insert({
        employee_id:  employeeId,
        event_type:   'hired',
        event_date:   today,
        description:  `Imported from April salary sheet — ${row.position || 'Staff'}`,
        created_by:   user.id,
      });

      result.imported++;
    } catch (e) {
      result.errors.push({
        rowIndex: row.rowIndex,
        name: row.first_name,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  revalidatePath('/beithady/hr/team');
  return result;
}
```

- [ ] **Step 2: Create import-dialog.tsx**

```tsx
// src/app/beithady/hr/team/_components/import-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { parseImportFile } from '@/lib/beithady/hr/hr-import';
import { importEmployeesAction } from '@/lib/beithady/hr/hr-actions';
import { BUILDING_LABELS } from '@/lib/beithady/hr/hr-types';
import type { ImportPreviewResult, ImportRow } from '@/lib/beithady/hr/hr-types';

type Step = 'upload' | 'preview' | 'done';

type Props = { open: boolean; onClose: () => void };

export function ImportDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() { setStep('upload'); setPreview(null); setParseError(''); setResult(null); }

  async function handleFile(file: File) {
    setParseError('');
    try {
      const buf = await file.arrayBuffer();
      const pr = await parseImportFile(buf);
      setPreview(pr);
      setStep('preview');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not parse file');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleConfirm() {
    if (!preview) return;
    const toImport = preview.rows.filter(r => r.validationState !== 'error');
    startTransition(async () => {
      const res = await importEmployeesAction(toImport);
      setResult({ imported: res.imported, skipped: res.skipped + res.errors.length });
      setStep('done');
    });
  }

  function toggleTerminated(rowIndex: number) {
    if (!preview) return;
    setPreview(p => {
      if (!p) return p;
      const rows = p.rows.map(r =>
        r.rowIndex === rowIndex
          ? { ...r, status: r.status === 'terminated' ? ('on_job' as const) : ('terminated' as const), isRedRow: !r.isRedRow }
          : r
      );
      return { ...p, rows };
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold">Import Team Members</h2>
          <button onClick={() => { reset(); onClose(); }} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700 px-6 shrink-0">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => (
            <div key={s} className={`flex items-center gap-2 px-4 py-3 text-sm ${step === s ? 'text-violet-600 font-medium border-b-2 border-violet-500' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold ${step === s ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>{i + 1}</span>
              {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview & Validate' : 'Done'}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center hover:border-violet-400 transition-colors"
              >
                <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">Drop your Excel file here</p>
                <p className="text-sm text-slate-500 mt-1">or click to browse (.xlsx · .xls)</p>
                <input type="file" accept=".xlsx,.xls" className="hidden" id="import-file"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                <label htmlFor="import-file" className="mt-4 inline-block cursor-pointer px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700">
                  Choose File
                </label>
              </div>
              {parseError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>}
              <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm space-y-1 text-slate-600 dark:text-slate-300">
                <p className="font-semibold">Expected columns (order flexible):</p>
                <p>Name · JobTitle · S.Package · Transportation Allowance · Bonus · Analytic</p>
                <p className="mt-2 text-xs text-slate-400">Red-highlighted rows are auto-detected as Terminated. Use the toggle in Step 2 if detection misses any.</p>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && preview && (
            <div>
              {/* Summary */}
              <div className="flex gap-3 mb-4">
                <Chip icon={<CheckCircle2 size={14} />} label={`${preview.readyCount} Ready`} color="emerald" />
                <Chip icon={<AlertTriangle size={14} />} label={`${preview.incompleteCount} Incomplete`} color="amber" />
                <Chip icon={<AlertCircle size={14} />} label={`${preview.errorCount} Errors (skipped)`} color="red" />
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="text-left py-2 pr-3">Name</th>
                      <th className="text-left py-2 pr-3">Position</th>
                      <th className="text-left py-2 pr-3">Building</th>
                      <th className="text-right py-2 pr-3">Salary</th>
                      <th className="text-center py-2 pr-3">Status</th>
                      <th className="text-center py-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map(row => (
                      <tr key={row.rowIndex}
                        className={`border-b border-slate-100 dark:border-slate-800 ${
                          row.validationState === 'error' ? 'opacity-50 bg-red-50 dark:bg-red-950/20' : ''
                        }`}>
                        <td className="py-2 pr-3 font-medium">{row.first_name}</td>
                        <td className="py-2 pr-3 text-slate-500">{row.position || '—'}</td>
                        <td className="py-2 pr-3 text-slate-500">
                          {row.building_code ? BUILDING_LABELS[row.building_code] : <span className="text-amber-600">?</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {row.salary_package.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-center">
                          <button onClick={() => toggleTerminated(row.rowIndex)}
                            className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              row.status === 'terminated'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            }`}>
                            {row.status === 'terminated' ? 'Terminated' : 'On Job'}
                          </button>
                        </td>
                        <td className="py-2 text-center">
                          {row.validationState === 'ready' && <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />}
                          {row.validationState === 'incomplete' && <AlertTriangle size={14} className="text-amber-500 mx-auto" title={row.incompleteFields.join(', ')} />}
                          {row.validationState === 'error' && <AlertCircle size={14} className="text-red-500 mx-auto" title={row.errors.join(', ')} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 'done' && result && (
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <h3 className="text-xl font-semibold">{result.imported} employees imported</h3>
              {result.skipped > 0 && (
                <p className="text-sm text-slate-500">{result.skipped} rows were skipped (errors or validation failures).</p>
              )}
              <p className="text-sm text-slate-500">Employees with missing fields are marked ⚠️ in the roster — open their profile to complete.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
          {step === 'upload' && (
            <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={isPending}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
                {isPending ? 'Importing…' : `Import ${(preview?.readyCount ?? 0) + (preview?.incompleteCount ?? 0)} employees`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={() => { reset(); onClose(); }} className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, color }: { icon: React.ReactNode; label: string; color: 'emerald' | 'amber' | 'red' }) {
  const cls = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cls}`}>
      {icon} {label}
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-actions.ts src/app/beithady/hr/team/_components/import-dialog.tsx
git commit -m "feat(hr): import server action + 3-step import wizard with red-row toggle"
```

---

## Task 17: Team Roster Component

**Files:**
- Create: `src/app/beithady/hr/team/_components/team-roster.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/beithady/hr/team/_components/team-roster.tsx
'use client';

import { useState, useCallback } from 'react';
import { Search, Plus, Upload, User, MoreHorizontal } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { AddEditMemberDialog } from './add-edit-member-dialog';
import { ImportDialog } from './import-dialog';
import { terminateEmployeeAction } from '@/lib/beithady/hr/hr-actions';
import { getEmployeeEvents } from '@/lib/beithady/hr/hr-queries';
import {
  DEPARTMENT_LABELS, BUILDING_LABELS, BUILDING_CODES, EMPLOYEE_STATUSES, STATUS_LABELS,
  type HrEmployeeRow, type EmployeeStatus, type BuildingCode, type HrEvent,
} from '@/lib/beithady/hr/hr-types';

type Props = { initialRows: HrEmployeeRow[] };

export function TeamRoster({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HrEmployeeRow | undefined>();
  const [editEvents, setEditEvents] = useState<HrEvent[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Client-side filter (server already fetched all; for large datasets swap to URL params)
  const filtered = rows.filter(r => {
    const s = search.toLowerCase();
    if (s && !r.first_name.toLowerCase().includes(s) &&
        !(r.arabic_name?.toLowerCase().includes(s)) &&
        !(r.national_id?.includes(s)) &&
        !(r.company_id.toLowerCase().includes(s))) return false;
    if (filterDept && r.department !== filterDept) return false;
    if (filterBuilding && r.current_contract?.building_code !== filterBuilding) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const openAdd = useCallback(() => {
    setEditTarget(undefined);
    setEditEvents([]);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback(async (emp: HrEmployeeRow) => {
    setEditTarget(emp);
    // Fetch events client-side for timeline tab
    try {
      const evs = await getEmployeeEvents(emp.id);
      setEditEvents(evs);
    } catch { setEditEvents([]); }
    setDialogOpen(true);
  }, []);

  const handleTerminate = useCallback(async (id: string) => {
    const date = new Date().toISOString().slice(0, 10);
    await terminateEmployeeAction(id, date, '');
    setRows(rs => rs.map(r => r.id === id ? { ...r, status: 'terminated' as EmployeeStatus } : r));
    setOpenMenuId(null);
  }, []);

  const uniqueDepts = [...new Set(rows.map(r => r.department))].sort();

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="ix-input pl-8 w-full" placeholder="Search name, Arabic, NID, BH-ID…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <select className="ix-input w-auto" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {uniqueDepts.map(d => (
            <option key={d} value={d}>{DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS] ?? d}</option>
          ))}
        </select>

        <select className="ix-input w-auto" value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}>
          <option value="">All Buildings</option>
          {BUILDING_CODES.map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b]}</option>
          ))}
        </select>

        <select className="ix-input w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {EMPLOYEE_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <button onClick={() => setImportOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
          <Upload size={14} /> Import
        </button>

        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
          <Plus size={14} /> Add Member
        </button>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="text-left px-4 py-3 w-10" />
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">BH-ID</th>
              <th className="text-left px-4 py-3">Position</th>
              <th className="text-left px-4 py-3">Department</th>
              <th className="text-left px-4 py-3">Building</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Joined</th>
              <th className="text-right px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id}
                onClick={() => openEdit(emp)}
                className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors ${
                  emp.status === 'terminated' ? 'opacity-50' : ''
                }`}>
                {/* Avatar */}
                <td className="px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center overflow-hidden shrink-0">
                    {emp.portrait_url
                      ? <img src={emp.portrait_url} alt="" className="w-full h-full object-cover" />
                      : <User size={14} className="text-violet-600 dark:text-violet-400" />
                    }
                  </div>
                </td>
                {/* Name */}
                <td className="px-4 py-3">
                  <p className={`font-medium text-slate-900 dark:text-slate-100 ${emp.status === 'terminated' ? 'line-through' : ''}`}>
                    {emp.first_name} {emp.last_name ?? ''}
                  </p>
                  {emp.arabic_name && (
                    <p className="text-xs text-slate-400 mt-0.5" dir="rtl">{emp.arabic_name}</p>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-amber-600 dark:text-amber-400">{emp.company_id}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{emp.position}</td>
                <td className="px-4 py-3 text-slate-500">
                  {DEPARTMENT_LABELS[emp.department as keyof typeof DEPARTMENT_LABELS] ?? emp.department}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {emp.current_contract
                    ? (BUILDING_LABELS[emp.current_contract.building_code] ?? emp.current_contract.building_code)
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={emp.status} />
                  {emp.incomplete_fields.length > 0 && (
                    <span className="ml-1 text-[10px] text-amber-600" title={`Missing: ${emp.incomplete_fields.join(', ')}`}>⚠️</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {emp.date_joined
                    ? new Date(emp.date_joined).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  <div className="relative inline-block">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === emp.id ? null : emp.id)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <MoreHorizontal size={14} />
                    </button>
                    {openMenuId === emp.id && (
                      <div className="absolute right-0 top-8 z-10 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg text-sm overflow-hidden">
                        <button onClick={() => { openEdit(emp); setOpenMenuId(null); }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                          Edit
                        </button>
                        {emp.status !== 'terminated' && (
                          <button onClick={() => handleTerminate(emp.id)}
                            className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                            Terminate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddEditMemberDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        employee={editTarget}
        events={editEvents}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep team-roster
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/team/_components/team-roster.tsx
git commit -m "feat(hr): TeamRoster — search/filter table, Add/Edit/Terminate, Import, ⚠️ incomplete badge"
```

---

## Task 18: Team Page + Run Full Test Suite

**Files:**
- Create: `src/app/beithady/hr/team/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/beithady/hr/team/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listEmployees } from '@/lib/beithady/hr/hr-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { TeamRoster } from './_components/team-roster';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  await requireBeithadyPermission('hr', 'read');

  const { rows, total } = await listEmployees({ pageSize: 200 });

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Team Members' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Team Members"
        subtitle={`${total} employee${total !== 1 ? 's' : ''} — add, edit, import from Excel`}
      />
      <TeamRoster initialRows={rows} />
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all existing tests pass + new HR tests pass (hr-company-id: 5, hr-nid: 7, hr-import: 8 = 20 new tests).

- [ ] **Step 3: Start dev and verify manually**

```bash
npm run dev
```
Check:
1. `/beithady` → "People" tile visible (admin/manager login)
2. `/beithady/hr` → 11-tile hub, Team Members active, rest dimmed
3. `/beithady/hr/team` → empty roster with Add Member + Import buttons
4. Click **+ Add Member** → slide-over opens with 3 tabs
5. Fill Personal Info → NID auto-fills DOB + gender on blur
6. Fill Contract & Payout → building + salary
7. Save → row appears in roster with BH-001 company ID
8. Click **Import** → drop April Excel → preview with auto-mapped rows + terminated toggle
9. Confirm → rows inserted, ⚠️ badges on rows with missing fields

- [ ] **Step 4: Deploy**

```bash
git add src/app/beithady/hr/team/page.tsx
git commit -m "feat(hr): Team Members page — server component wiring HR roster"
git fetch origin main && git rebase origin/main
git push origin HEAD:main
vercel --prod
```

---

## Part 2 Complete — Sprint 1 Shipped

| ✅ | Component |
|---|---|
| StatusBadge | 5 status colors |
| TimelineTab | Read-only audit log with icons |
| PersonalInfoTab | NID auto-fill, bilingual name, conditional termination fields |
| ContractPayoutTab | Contract type/dates, building, salary+allowances, bank info, salary history chips |
| AddEditMemberDialog | Right-side slide-over, 3 tabs, photo upload, server action |
| XLSX import parser | exceljs, analytic→building map, red-row detect, validated (20 tests) |
| Import server action | Batch insert, partial-import OK, generates BH-NNN IDs |
| Import dialog | 3-step wizard: Upload → Preview/toggle → Done |
| TeamRoster | Search/filter, avatar, bilingual name, ⚠️ incomplete badge, ••• menu |
| Team page | Server component, `/beithady/hr/team` |

**Next sprint:** `Monthly Payroll` (Excel upload + payslip print engine).
