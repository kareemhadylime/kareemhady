'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { addEmployeeAction, editEmployeeAction } from '@/lib/beithady/hr/hr-actions';
import type { HrEmployeeRow, PersonalInfoInput, ContractInput, HrEvent } from '@/lib/beithady/hr/hr-types';
import { PersonalInfoTab } from './personal-info-tab';
import { ContractPayoutTab } from './contract-payout-tab';
import { TimelineTab } from './timeline-tab';

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
    payslip_language: 'arabic' as const,
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
    payslip_language:   emp.payslip_language,
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

  // Reset form state when dialog opens or employee changes
  useEffect(() => {
    if (open) {
      setPersonal(employee ? employeeToPersonal(employee) : emptyPersonal());
      setContract(employee ? contractToInput(employee.current_contract) : emptyContract());
      setTab('personal');
      setError('');
    }
  }, [open, employee]);

  // ESC key + body scroll lock
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
    { id: 'personal',  label: '👤 Personal Info' },
    { id: 'contract',  label: '📄 Contract & Payout' },
    { id: 'timeline',  label: '📅 Timeline' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isEdit ? 'Edit Team Member' : 'Add Team Member'}
            </h2>
            {isEdit && employee && (
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{employee.company_id}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Tab nav */}
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

        {/* Tab content */}
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

        {/* Footer with error + actions */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between gap-3">
          {error
            ? <p className="text-sm text-red-600 dark:text-red-400 flex-1">{error}</p>
            : <span className="flex-1" />
          }
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
