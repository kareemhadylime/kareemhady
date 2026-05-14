'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { logOvertimeAction } from '@/lib/beithady/hr/hr-leave-ot-actions';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
};

export function LogOtDialog({ open, employees, onClose, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours]           = useState('');
  const [reason, setReason]         = useState('');
  const [error, setError]           = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() { setEmployeeId(''); setDate(new Date().toISOString().slice(0, 10)); setHours(''); setReason(''); setError(''); }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!employeeId)        { setError('Select an employee'); return; }
    if (!date)              { setError('Date is required'); return; }
    const h = parseFloat(hours);
    if (!hours || isNaN(h) || h <= 0) { setError('Hours must be > 0'); return; }

    startTransition(async () => {
      const res = await logOvertimeAction({ employee_id: employeeId, date, hours: h, reason });
      if (!res.ok) { setError(res.error ?? 'Unknown error'); return; }
      reset(); onSaved(); onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Log Overtime</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Employee</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="ix-input w-full">
              <option value="">Select employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.display_name} ({e.company_id})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Hours</label>
              <input type="number" min="0.5" step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 3" className="ix-input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="ix-input w-full resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors disabled:opacity-50">
            {isPending ? 'Saving…' : 'Log OT'}
          </button>
        </div>
      </div>
    </div>
  );
}
