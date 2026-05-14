'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Plus } from 'lucide-react';
import { LogOtDialog } from './log-ot-dialog';
import { reviewOvertimeAction } from '@/lib/beithady/hr/hr-leave-ot-actions';
import type { OvertimeRecordRow } from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  pendingOT: OvertimeRecordRow[];
  approvedOT: OvertimeRecordRow[];
  canApprove: boolean;
  employees: EmployeeOption[];
  onRefresh: () => void;
};

export function OtTab({ pendingOT, approvedOT, canApprove, employees, onRefresh }: Props) {
  const [logOpen, setLogOpen] = useState(false);

  async function handleReview(id: string, decision: 'approved' | 'rejected') {
    await reviewOvertimeAction(id, decision);
    onRefresh();
  }

  function OtRow({ r, showActions }: { r: OvertimeRecordRow; showActions: boolean }) {
    return (
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${showActions ? 'bg-amber-950/20 border border-amber-700/20' : 'bg-white/3 border border-white/5'}`}>
        <span className="font-medium text-white text-sm min-w-[140px]">{r.employee_name}</span>
        <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">{r.company_id}</span>
        <span className="text-sm text-white/60">{r.date}</span>
        <span className="text-sm font-semibold text-white">{r.hours}h</span>
        {r.reason && <span className="text-xs text-white/40 truncate max-w-[200px]">{r.reason}</span>}
        {showActions && canApprove ? (
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
        ) : !showActions ? (
          <div className="ml-auto">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Log OT
        </button>
      </div>

      {pendingOT.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-300 mb-3">⏳ Pending ({pendingOT.length})</h3>
          <div className="space-y-2">
            {pendingOT.map(r => <OtRow key={r.id} r={r} showActions={true} />)}
          </div>
        </div>
      )}

      {approvedOT.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/50 mb-3">Approved</h3>
          <div className="space-y-2">
            {approvedOT.map(r => <OtRow key={r.id} r={r} showActions={false} />)}
          </div>
        </div>
      )}

      {pendingOT.length === 0 && approvedOT.length === 0 && (
        <p className="text-center text-white/30 italic py-8">No overtime records for this period.</p>
      )}

      <LogOtDialog
        open={logOpen}
        employees={employees}
        onClose={() => setLogOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  );
}