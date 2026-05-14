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
  companyId: string;          // read-only display (BH-001 or BH-??? for new)
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

      {/* Gender chip (auto-filled, read-only display) */}
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

      {/* Termination fields (conditional on status = terminated) */}
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
