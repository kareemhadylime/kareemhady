'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Download, Pencil, Trash2, Plus } from 'lucide-react';
import { AddTrainingDialog } from './add-training-dialog';
import {
  deleteTrainingRecordAction,
  getTrainingRecordDownloadUrl,
} from '@/lib/beithady/hr/hr-training-actions';
import {
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ICONS,
  formatTrainingDateRange,
} from '@/lib/beithady/hr/hr-training-types';
import {
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrTrainingRecord, RecordType, EmployeeTrainingSummary } from '@/lib/beithady/hr/hr-training-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  initialSummary: EmployeeTrainingSummary[];
  employees: EmployeeOption[];
  canManage: boolean;
  onRefresh: () => void;
};

export function EmployeeTrainingList({ initialSummary, employees, canManage, onRefresh }: Props) {
  const router = useRouter();
  const [summary, setSummary]         = useState(initialSummary);
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editRecord, setEditRecord]   = useState<HrTrainingRecord | null>(null);
  const [dialogEmpId, setDialogEmpId] = useState('');
  const [deleting, setDeleting]       = useState<string | null>(null);

  const filtered = summary.filter(e =>
    e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    e.company_id.toLowerCase().includes(search.toLowerCase())
  );

  function toggleExpand(empId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  }

  function openAdd(empId: string) { setEditRecord(null); setDialogEmpId(empId); setDialogOpen(true); }
  function openEdit(rec: HrTrainingRecord) { setEditRecord(rec); setDialogEmpId(''); setDialogOpen(true); }

  async function handleDelete(recordId: string) {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    setDeleting(recordId);
    const res = await deleteTrainingRecordAction(recordId);
    setDeleting(null);
    if (res.ok) {
      setSummary(prev => prev.map(e => ({
        ...e,
        records: e.records.filter(r => r.id !== recordId),
      })));
    }
  }

  async function handleDownload(recordId: string) {
    const res = await getTrainingRecordDownloadUrl(recordId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  function handleSaved() { onRefresh(); router.refresh(); }

  return (
    <div className="space-y-3">
      {/* Search + Add */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="ix-input text-sm flex-1"
        />
        {canManage && (
          <button
            onClick={() => { setEditRecord(null); setDialogEmpId(''); setDialogOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Record
          </button>
        )}
      </div>

      {/* Employee rows */}
      <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-white/30 italic">No employees found.</p>
        )}
        {filtered.map(emp => {
          const isOpen = expanded.has(emp.employee_id);
          return (
            <div key={emp.employee_id}>
              <button
                onClick={() => toggleExpand(emp.employee_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
              >
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />
                }
                <span className="font-medium text-white text-sm">{emp.employee_name}</span>
                <span className="text-xs font-mono bg-violet-900/40 text-violet-300 px-2 py-0.5 rounded">
                  {emp.company_id}
                </span>
                <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                  {emp.records.map(r => {
                    const status = getExpiryStatus(r.expiry_date);
                    return (
                      <span key={r.id} className={`text-xs px-2 py-0.5 rounded-full ${EXPIRY_STATUS_COLORS[status]}`}>
                        {RECORD_TYPE_ICONS[r.record_type as RecordType]} {r.title}
                      </span>
                    );
                  })}
                  {emp.records.length === 0 && (
                    <span className="text-xs text-white/20 italic">no records</span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-white/2 space-y-2">
                  {emp.records.map(rec => {
                    const status = getExpiryStatus(rec.expiry_date);
                    return (
                      <div key={rec.id} className="flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5 bg-neutral-900">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                          {RECORD_TYPE_ICONS[rec.record_type as RecordType]} {RECORD_TYPE_LABELS[rec.record_type as RecordType]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{rec.title}</p>
                          <p className="text-xs text-white/40">{formatTrainingDateRange(rec.date, rec.expiry_date)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {rec.file_name && (
                            <button
                              onClick={() => handleDownload(rec.id)}
                              title={`Download ${rec.file_name}`}
                              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button onClick={() => openEdit(rec)}
                                className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(rec.id)}
                                disabled={deleting === rec.id}
                                className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {canManage && (
                    <button
                      onClick={() => openAdd(emp.employee_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/40 hover:text-white border border-dashed border-white/20 hover:border-white/40 rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add record for {emp.employee_name.split(' ')[0]}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddTrainingDialog
        open={dialogOpen}
        employees={employees}
        editRecord={editRecord}
        defaultEmployeeId={dialogEmpId}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
