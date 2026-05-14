// src/app/beithady/hr/payroll/_components/payroll-roster.tsx
'use client';

import { useState } from 'react';
import { Upload, Printer, Download, AlertTriangle } from 'lucide-react';
import { UploadPayrollDialog } from './upload-payroll-dialog';
import { PrintFilterDrawer } from './print-filter-drawer';
import { BUILDING_LABELS, BUILDING_CODES } from '@/lib/beithady/hr/hr-types';
import type { PayrollMonth, PayrollEntryRow } from '@/lib/beithady/hr/hr-payroll-types';
import type { BuildingCode } from '@/lib/beithady/hr/hr-types';

type Props = {
  months: PayrollMonth[];
  initialMonthId: string | null;
  initialEntries: PayrollEntryRow[];
};

export function PayrollRoster({ months, initialMonthId, initialEntries }: Props) {
  const [selectedMonthId, setSelectedMonthId] = useState(initialMonthId);
  const [entries, setEntries] = useState(initialEntries);
  const [filterBuilding, setFilterBuilding] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);

  const filtered = filterBuilding
    ? entries.filter(e => e.building_code === filterBuilding)
    : entries;

  const netTotal = filtered.reduce((sum, e) => sum + e.net_salary, 0);

  async function handleMonthChange(monthId: string) {
    setSelectedMonthId(monthId);
    try {
      const res = await fetch(`/api/hr/payroll-entries?monthId=${encodeURIComponent(monthId)}`);
      if (res.ok) {
        const data = await res.json() as { entries: PayrollEntryRow[] };
        setEntries(data.entries);
      }
    } catch { /* keep existing entries on error */ }
  }

  async function downloadPayslip(entryId: string) {
    setLoadingEntryId(entryId);
    try {
      const res = await fetch(`/api/hr/payslip/${entryId}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const header = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = header.match(/filename="([^"]+)"/);
      a.download = fnMatch?.[1] ?? `payslip-${entryId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoadingEntryId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {months.length === 0 ? (
          <p className="text-sm text-slate-500">No payroll months uploaded yet.</p>
        ) : (
          <select className="ix-input w-auto font-semibold"
            value={selectedMonthId ?? ''}
            onChange={e => handleMonthChange(e.target.value)}>
            {months.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}

        <select className="ix-input w-auto" value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}>
          <option value="">All Buildings</option>
          {BUILDING_CODES.map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b]}</option>
          ))}
        </select>

        <div className="flex-1" />

        {selectedMonthId && (
          <button onClick={() => setPrintOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Printer size={14} /> Print Payslips
          </button>
        )}

        <button onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
          <Upload size={14} /> Upload New Month
        </button>
      </div>

      {/* Stats row */}
      {filtered.length > 0 && (
        <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300 flex-wrap">
          <span><strong>{filtered.length}</strong> employee{filtered.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>Total net: <strong className="text-slate-900 dark:text-slate-100">EGP {netTotal.toLocaleString()}</strong></span>
          {filtered.some(e => !e.employee_id) && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle size={12} />
              {filtered.filter(e => !e.employee_id).length} unmatched
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {months.length === 0 && (
        <div className="text-center py-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <Upload size={32} className="mx-auto text-slate-400 mb-3" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">No payroll uploaded yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload your first monthly salary sheet to get started</p>
          <button onClick={() => setUploadOpen(true)}
            className="mt-4 px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
            Upload Month
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">BH-ID</th>
                <th className="text-left px-4 py-3">Position</th>
                <th className="text-left px-4 py-3">Building</th>
                <th className="text-center px-4 py-3">Days</th>
                <th className="text-right px-4 py-3">Net Salary</th>
                <th className="text-center px-4 py-3">Lang</th>
                <th className="text-center px-4 py-3 w-12">🖨</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id}
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${entry.is_terminated ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {entry.employee_name ?? entry.sheet_name}
                    {!entry.employee_id && <span className="ml-1 text-[10px] text-amber-600">⚠️</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-600 dark:text-amber-400">
                    {entry.bh_id ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{entry.job_title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {entry.building_code
                      ? (BUILDING_LABELS[entry.building_code as BuildingCode] ?? entry.building_code)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{entry.working_days}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {entry.net_salary.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      entry.payslip_language === 'arabic'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {entry.payslip_language === 'arabic' ? 'AR' : 'EN'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => downloadPayslip(entry.id)}
                      disabled={loadingEntryId === entry.id}
                      className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 disabled:opacity-40"
                      title="Download payslip">
                      <Download size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UploadPayrollDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {selectedMonthId && (
        <PrintFilterDrawer
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          monthId={selectedMonthId}
          totalEntries={filtered.length}
        />
      )}
    </div>
  );
}
