// src/app/beithady/hr/attendance/_components/attendance-board.tsx
'use client';

import { useState } from 'react';
import { Download, Upload, CheckCircle2, Clock } from 'lucide-react';
import { ImportAttendanceDialog } from './import-attendance-dialog';
import { approveAttendanceAction, approveAttendanceRowAction } from '@/lib/beithady/hr/hr-attendance-actions';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { AttendanceRow } from '@/lib/beithady/hr/hr-attendance-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';

type Props = {
  initialRows: AttendanceRow[];
  initialDate: string;
  canApprove: boolean;
};

export function AttendanceBoard({ initialRows, initialDate, canApprove }: Props) {
  const [rows, setRows]               = useState<AttendanceRow[]>(initialRows);
  const [date, setDate]               = useState(initialDate);
  const [filterBuilding, setBuilding] = useState('');
  const [filterDept, setDept]         = useState('');
  const [importOpen, setImportOpen]   = useState(false);
  const [approving, setApproving]     = useState(false);

  async function fetchRows(d: string, b: string, dept: string) {
    const params = new URLSearchParams({ date: d });
    if (b)    params.set('building', b);
    if (dept) params.set('department', dept);
    const res = await fetch(`/api/hr/attendance/day-view?${params}`);
    if (res.ok) {
      const { rows: fetched } = await res.json() as { rows: AttendanceRow[] };
      setRows(fetched);
    }
  }

  function handleDateChange(d: string) { setDate(d); fetchRows(d, filterBuilding, filterDept); }
  function handleBuildingChange(b: string) { setBuilding(b); fetchRows(date, b, filterDept); }
  function handleDeptChange(dept: string) { setDept(dept); fetchRows(date, filterBuilding, dept); }

  async function handleApproveAll() {
    setApproving(true);
    const res = await approveAttendanceAction({
      date,
      building:   filterBuilding || undefined,
      department: filterDept || undefined,
    });
    if (res.approved > 0) await fetchRows(date, filterBuilding, filterDept);
    setApproving(false);
  }

  async function handleApproveRow(recordId: string) {
    const res = await approveAttendanceRowAction(recordId);
    if (res.ok) {
      setRows(prev => prev.map(r =>
        r.record_id === recordId ? { ...r, approval_state: 'approved' as const } : r
      ));
    }
  }

  function handleTemplateDownload() {
    const params = new URLSearchParams({ date });
    if (filterBuilding) params.set('building', filterBuilding);
    if (filterDept)     params.set('department', filterDept);
    window.open(`/api/hr/attendance/template?${params}`, '_blank');
  }

  const pendingCount  = rows.filter(r => r.approval_state === 'pending').length;
  const approvedCount = rows.filter(r => r.approval_state === 'approved').length;
  const noRecordCount = rows.filter(r => r.record_id === null).length;

  return (
    <div className="space-y-4">
      {/* Filters + actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={e => handleDateChange(e.target.value)}
          className="ix-input text-sm"
        />
        <select
          value={filterBuilding}
          onChange={e => handleBuildingChange(e.target.value)}
          className="ix-input text-sm"
        >
          <option value="">All Buildings</option>
          {BUILDING_CODES.filter(b => b !== 'OTHER').map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b as BuildingCode]}</option>
          ))}
        </select>
        <select
          value={filterDept}
          onChange={e => handleDeptChange(e.target.value)}
          className="ix-input text-sm"
        >
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>{DEPARTMENT_LABELS[d as Department]}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleTemplateDownload}
            className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">BH-ID</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/30 italic">
                  No active employees for this filter.
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.employee_id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2.5 text-white font-medium">
                    {r.first_name} {r.last_name ?? ''}
                    {r.arabic_name && (
                      <span className="block text-xs text-white/40 font-normal" dir="rtl">{r.arabic_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">
                      {r.company_id}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white/60">
                    {DEPARTMENT_LABELS[r.department as Department] ?? r.department}
                  </td>
                  <td className="px-4 py-2.5 text-white/60">
                    {r.building_code ? (BUILDING_LABELS[r.building_code as BuildingCode] ?? r.building_code) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === 'present' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300">✅ Present</span>
                    )}
                    {r.status === 'absent' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">❌ Absent</span>
                    )}
                    {r.status === null && <span className="text-xs text-white/25">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.approval_state === 'approved' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {r.approval_state === 'pending' && canApprove && r.record_id && (
                      <button
                        onClick={() => handleApproveRow(r.record_id!)}
                        title="Approve"
                        className="w-5 h-5 rounded-full border border-amber-500/50 text-amber-400 hover:bg-amber-900/40 flex items-center justify-center transition-colors"
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                    )}
                    {r.approval_state === 'pending' && !canApprove && (
                      <Clock className="w-4 h-4 text-amber-400/50" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-white/50">
        <span>{pendingCount} pending · {approvedCount} approved · {noRecordCount} not recorded</span>
        {canApprove && pendingCount > 0 && (
          <button
            onClick={handleApproveAll}
            disabled={approving}
            className="px-4 py-1.5 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {approving ? 'Approving…' : `Approve All Pending (${pendingCount})`}
          </button>
        )}
      </div>

      <ImportAttendanceDialog
        open={importOpen}
        defaultDate={date}
        onClose={() => setImportOpen(false)}
        onSaved={() => fetchRows(date, filterBuilding, filterDept)}
      />
    </div>
  );
}
