'use client';

import { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';

type Props = {
  open: boolean;
  onClose: () => void;
  monthId: string;
  totalEntries: number;
};

export function PrintFilterDrawer({ open, onClose, monthId, totalEntries }: Props) {
  const [buildings, setBuildings] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [excludeTerminated, setExcludeTerminated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleBuilding(code: string) {
    setBuildings(bs => bs.includes(code) ? bs.filter(b => b !== code) : [...bs, code]);
  }
  function toggleDept(dept: string) {
    setDepts(ds => ds.includes(dept) ? ds.filter(d => d !== dept) : [...ds, dept]);
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hr/payslips/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthId,
          filters: {
            building_codes:     buildings.length ? buildings : undefined,
            departments:        depts.length ? depts : undefined,
            exclude_terminated: excludeTerminated,
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Failed to generate PDF');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const header = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = header.match(/filename="([^"]+)"/);
      a.download = fnMatch?.[1] ?? `payslips-batch.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Print Payslips</h3>
          <button onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={14} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Building */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Building</p>
            <div className="flex flex-wrap gap-2">
              {BUILDING_CODES.map(b => (
                <button key={b} onClick={() => toggleBuilding(b)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    buildings.includes(b)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-violet-400'
                  }`}>
                  {b}
                </button>
              ))}
            </div>
            {buildings.length === 0 && <p className="text-xs text-slate-400 mt-1">All buildings</p>}
          </div>

          {/* Department */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Department</p>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map(d => (
                <button key={d} onClick={() => toggleDept(d)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    depts.includes(d)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-violet-400'
                  }`}>
                  {DEPARTMENT_LABELS[d]}
                </button>
              ))}
            </div>
            {depts.length === 0 && <p className="text-xs text-slate-400 mt-1">All departments</p>}
          </div>

          {/* Exclude terminated */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeTerminated}
              onChange={e => setExcludeTerminated(e.target.checked)}
              className="accent-violet-600 w-4 h-4"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Exclude terminated employees</span>
          </label>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {loading ? 'Generating…' : 'Generate PDF'}
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">
            Each employee printed in their language preference
          </p>
        </div>
      </div>
    </div>
  );
}
