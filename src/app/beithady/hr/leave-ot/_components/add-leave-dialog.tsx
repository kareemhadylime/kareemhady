'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { addLeaveRequestAction } from '@/lib/beithady/hr/hr-leave-ot-actions';
import { calcLeaveDays, LEAVE_TYPE_LABELS } from '@/lib/beithady/hr/hr-leave-ot-types';
import type { LeaveType } from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
};

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'emergency'];

export function AddLeaveDialog({ open, employees, onClose, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType]   = useState<LeaveType>('annual');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [reason, setReason]         = useState('');
  const [error, setError]           = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const daysCount = startDate && endDate ? calcLeaveDays(startDate, endDate) : 0;

  function reset() {
    setEmployeeId(''); setLeaveType('annual'); setStartDate('');
    setEndDate(''); setReason(''); setError('');
  }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!employeeId)            { setError('Select an employee'); return; }
    if (!startDate || !endDate) { setError('Select start and end dates'); return; }
    if (daysCount <= 0)         { setError('End date must be on or after start date'); return; }

    startTransition(async () => {
      const res = await addLeaveRequestAction({
        employee_id: employeeId,
        leave_type:  leaveType,
        start_date:  startDate,
        end_date:    endDate,
        days_count:  daysCount,
        reason,
      });
      if (!res.ok) { setError(res.error ?? 'Unknown error'); return; }
      reset();
      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Add Leave Request</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
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
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Leave Type</label>
            <div className="flex gap-2">
              {LEAVE_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setLeaveType(t)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                    leaveType === t
                      ? 'bg-rose-600 border-rose-500 text-white font-semibold'
                      : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {LEAVE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="ix-input w-full" />
            </div>
          </div>
          {daysCount > 0 && (
            <p className="text-sm text-white/60">
              Duration: <span className="font-semibold text-white">{daysCount} day{daysCount !== 1 ? 's' : ''}</span>
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="ix-input w-full resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
