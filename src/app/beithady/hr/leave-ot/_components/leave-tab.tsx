// src/app/beithady/hr/leave-ot/_components/leave-tab.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Plus } from 'lucide-react';
import { AddLeaveDialog } from './add-leave-dialog';
import { reviewLeaveRequestAction, setLeaveBalanceAction } from '@/lib/beithady/hr/hr-leave-ot-actions';
import { LEAVE_TYPE_LABELS } from '@/lib/beithady/hr/hr-leave-ot-types';
import type { LeaveRequestRow, LeaveBalanceRow, LeaveType } from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  pendingRequests: LeaveRequestRow[];
  balances: LeaveBalanceRow[];
  canApprove: boolean;
  employees: EmployeeOption[];
  year: number;
  onRefresh: () => void;
};

const LEAVE_TYPE_COLORS: Record<LeaveType, string> = {
  annual:    'bg-blue-900/50 text-blue-300',
  sick:      'bg-amber-900/50 text-amber-300',
  emergency: 'bg-red-900/50 text-red-300',
};

export function LeaveTab({ pendingRequests, balances, canApprove, employees, year, onRefresh }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<{ empId: string; year: number; type: LeaveType; value: string } | null>(null);

  async function handleReview(id: string, decision: 'approved' | 'rejected') {
    await reviewLeaveRequestAction(id, decision);
    onRefresh();
  }

  async function handleBalanceSave() {
    if (!editingBalance) return;
    const days = parseFloat(editingBalance.value);
    if (isNaN(days) || days < 0) return;
    await setLeaveBalanceAction(editingBalance.empId, editingBalance.year, editingBalance.type, days);
    setEditingBalance(null);
    onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
            ⏳ Pending ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-amber-950/20 border border-amber-700/20 rounded-xl px-4 py-3">
                <span className="font-medium text-white text-sm min-w-[140px]">{r.employee_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[r.leave_type]}`}>
                  {LEAVE_TYPE_LABELS[r.leave_type]}
                </span>
                <span className="text-sm text-white/60">
                  {r.start_date} → {r.end_date} · <span className="text-white">{r.days_count}d</span>
                </span>
                {r.reason && <span className="text-xs text-white/40 truncate max-w-[200px]">{r.reason}</span>}
                {canApprove && (
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => handleReview(r.id, 'approved')}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleReview(r.id, 'rejected')}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balances table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/70">Balances — {year}</h3>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Request
          </button>
        </div>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">BH-ID</th>
                <th className="px-4 py-3">Annual</th>
                <th className="px-4 py-3">Sick</th>
                <th className="px-4 py-3">Emergency</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/30 italic">No active employees.</td></tr>
              ) : balances.map(b => (
                <tr key={b.employee_id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2.5 text-white font-medium">{b.employee_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">{b.company_id}</span>
                  </td>
                  {/* Annual balance — editable */}
                  <td className="px-4 py-2.5">
                    {canApprove && editingBalance?.empId === b.employee_id && editingBalance.type === 'annual' ? (
                      <input
                        type="number" min="0" step="1"
                        value={editingBalance.value}
                        onChange={e => setEditingBalance(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onBlur={handleBalanceSave}
                        onKeyDown={e => { if (e.key === 'Enter') handleBalanceSave(); if (e.key === 'Escape') setEditingBalance(null); }}
                        autoFocus
                        className="w-16 px-2 py-0.5 rounded bg-white/10 text-white text-sm border border-white/20 focus:outline-none"
                      />
                    ) : (
                      <span
                        className={`text-sm cursor-pointer hover:text-white transition-colors ${b.annual_used > b.annual_total && b.annual_total > 0 ? 'text-red-400' : 'text-white/70'}`}
                        onClick={() => canApprove && setEditingBalance({ empId: b.employee_id, year, type: 'annual', value: String(b.annual_total) })}
                        title={canApprove ? 'Click to edit total' : undefined}
                      >
                        {b.annual_used}/{b.annual_total}d
                      </span>
                    )}
                  </td>
                  {/* Sick balance — editable */}
                  <td className="px-4 py-2.5">
                    {canApprove && editingBalance?.empId === b.employee_id && editingBalance.type === 'sick' ? (
                      <input
                        type="number" min="0" step="1"
                        value={editingBalance.value}
                        onChange={e => setEditingBalance(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onBlur={handleBalanceSave}
                        onKeyDown={e => { if (e.key === 'Enter') handleBalanceSave(); if (e.key === 'Escape') setEditingBalance(null); }}
                        autoFocus
                        className="w-16 px-2 py-0.5 rounded bg-white/10 text-white text-sm border border-white/20 focus:outline-none"
                      />
                    ) : (
                      <span
                        className="text-sm text-white/70 cursor-pointer hover:text-white transition-colors"
                        onClick={() => canApprove && setEditingBalance({ empId: b.employee_id, year, type: 'sick', value: String(b.sick_total) })}
                        title={canApprove ? 'Click to edit total' : undefined}
                      >
                        {b.sick_used}/{b.sick_total}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-white/30 text-sm">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddLeaveDialog
        open={addOpen}
        employees={employees}
        onClose={() => setAddOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  );
}
