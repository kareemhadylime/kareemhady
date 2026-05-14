'use client';

import { useState, useCallback } from 'react';
import { Search, Plus, Upload, User, MoreHorizontal } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { AddEditMemberDialog } from './add-edit-member-dialog';
import { ImportDialog } from './import-dialog';
import { terminateEmployeeAction } from '@/lib/beithady/hr/hr-actions';
import {
  DEPARTMENT_LABELS, BUILDING_LABELS, BUILDING_CODES,
  EMPLOYEE_STATUSES, STATUS_LABELS,
  type HrEmployeeRow, type EmployeeStatus,
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
  const [importOpen, setImportOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Client-side filter
  const filtered = rows.filter(r => {
    const s = search.toLowerCase();
    if (s && !r.first_name.toLowerCase().includes(s) &&
        !(r.last_name?.toLowerCase().includes(s)) &&
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
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((emp: HrEmployeeRow) => {
    setEditTarget(emp);
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
          <input className="ix-input pl-8 w-full"
            placeholder="Search name, Arabic, NID, BH-ID…"
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
                    {emp.first_name}{emp.last_name ? ` ${emp.last_name}` : ''}
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
        events={[]}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
