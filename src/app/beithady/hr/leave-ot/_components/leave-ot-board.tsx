// src/app/beithady/hr/leave-ot/_components/leave-ot-board.tsx
'use client';

import { useState } from 'react';
import { LeaveTab } from './leave-tab';
import { OtTab } from './ot-tab';
import type {
  LeaveRequestRow, LeaveBalanceRow, OvertimeRecordRow,
} from '@/lib/beithady/hr/hr-leave-ot-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  initialPendingLeave: LeaveRequestRow[];
  initialBalances: LeaveBalanceRow[];
  initialPendingOT: OvertimeRecordRow[];
  initialApprovedOT: OvertimeRecordRow[];
  employees: EmployeeOption[];
  canApprove: boolean;
};

type Tab = 'leave' | 'overtime';

export function LeaveOtBoard({
  initialPendingLeave,
  initialBalances,
  initialPendingOT,
  initialApprovedOT,
  employees,
  canApprove,
}: Props) {
  const [activeTab, setActiveTab]       = useState<Tab>('leave');
  const [pendingLeave, setPendingLeave] = useState(initialPendingLeave);
  const [balances, setBalances]         = useState(initialBalances);
  const [pendingOT, setPendingOT]       = useState(initialPendingOT);
  const [approvedOT, setApprovedOT]     = useState(initialApprovedOT);
  const [year, setYear]                 = useState(new Date().getFullYear());
  const [month, setMonth]               = useState(
    new Date().toISOString().slice(0, 7)  // "YYYY-MM"
  );

  async function refreshLeave() {
    const res = await fetch(`/api/hr/leave-ot/leave?year=${year}`);
    if (res.ok) {
      const { pending, balances: b } = await res.json() as {
        pending: LeaveRequestRow[];
        balances: LeaveBalanceRow[];
      };
      setPendingLeave(pending);
      setBalances(b);
    }
  }

  async function refreshOT() {
    const res = await fetch(`/api/hr/leave-ot/ot?month=${month}`);
    if (res.ok) {
      const { pending, approved } = await res.json() as {
        pending: OvertimeRecordRow[];
        approved: OvertimeRecordRow[];
      };
      setPendingOT(pending);
      setApprovedOT(approved);
    }
  }

  function handleYearChange(y: number) {
    setYear(y);
    fetch(`/api/hr/leave-ot/leave?year=${y}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setPendingLeave(d.pending); setBalances(d.balances); }
    });
  }

  function handleMonthChange(m: string) {
    setMonth(m);
    fetch(`/api/hr/leave-ot/ot?month=${m}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setPendingOT(d.pending); setApprovedOT(d.approved); }
    });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {(['leave', 'overtime'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-rose-500 text-white'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            {tab === 'leave' ? 'Leave' : 'Overtime'}
          </button>
        ))}

        {/* Filters — right side */}
        <div className="ml-auto flex items-center gap-2 pb-2">
          {activeTab === 'leave' && (
            <select
              value={year}
              onChange={e => handleYearChange(Number(e.target.value))}
              className="ix-input text-sm py-1"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {activeTab === 'overtime' && (
            <input
              type="month"
              value={month}
              onChange={e => handleMonthChange(e.target.value)}
              className="ix-input text-sm py-1"
            />
          )}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'leave' && (
        <LeaveTab
          pendingRequests={pendingLeave}
          balances={balances}
          canApprove={canApprove}
          employees={employees}
          year={year}
          onRefresh={refreshLeave}
        />
      )}
      {activeTab === 'overtime' && (
        <OtTab
          pendingOT={pendingOT}
          approvedOT={approvedOT}
          canApprove={canApprove}
          employees={employees}
          onRefresh={refreshOT}
        />
      )}
    </div>
  );
}
