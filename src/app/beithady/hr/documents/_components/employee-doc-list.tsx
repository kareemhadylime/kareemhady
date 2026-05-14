'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Download, Pencil, Trash2, Plus } from 'lucide-react';
import { AddDocumentDialog } from './add-document-dialog';
import {
  deleteDocumentAction,
  getDocumentDownloadUrl,
} from '@/lib/beithady/hr/hr-documents-actions';
import {
  DOC_TYPE_LABELS,
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocument, DocType, EmployeeDocSummary } from '@/lib/beithady/hr/hr-documents-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  initialSummary: EmployeeDocSummary[];
  employees: EmployeeOption[];
  canManage: boolean;
  onRefresh: () => void;
};

export function EmployeeDocList({ initialSummary, employees, canManage, onRefresh }: Props) {
  const router = useRouter();
  const [summary, setSummary]         = useState(initialSummary);
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editDoc, setEditDoc]         = useState<HrDocument | null>(null);
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

  function openAdd(empId: string) {
    setEditDoc(null);
    setDialogEmpId(empId);
    setDialogOpen(true);
  }

  function openEdit(doc: HrDocument) {
    setEditDoc(doc);
    setDialogEmpId('');
    setDialogOpen(true);
  }

  async function handleDelete(docId: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeleting(docId);
    const res = await deleteDocumentAction(docId);
    setDeleting(null);
    if (res.ok) {
      setSummary(prev => prev.map(e => ({
        ...e,
        documents: e.documents.filter(d => d.id !== docId),
      })));
    }
  }

  async function handleDownload(docId: string) {
    const res = await getDocumentDownloadUrl(docId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  function handleSaved() {
    onRefresh();
    router.refresh();
  }

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
            onClick={() => { setEditDoc(null); setDialogEmpId(''); setDialogOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Document
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
              {/* Row header */}
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
                  {emp.documents.map(d => {
                    const status = getExpiryStatus(d.expiry_date);
                    return (
                      <span key={d.id} className={`text-xs px-2 py-0.5 rounded-full ${EXPIRY_STATUS_COLORS[status]}`}>
                        {DOC_TYPE_LABELS[d.doc_type as DocType]}
                      </span>
                    );
                  })}
                  {emp.documents.length === 0 && (
                    <span className="text-xs text-white/20 italic">no documents</span>
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-white/2 space-y-2">
                  {emp.documents.map(doc => {
                    const status = getExpiryStatus(doc.expiry_date);
                    return (
                      <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5 bg-neutral-900">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                          {DOC_TYPE_LABELS[doc.doc_type as DocType]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-white/40">
                            {doc.document_number && <span className="mr-3">#{doc.document_number}</span>}
                            {doc.issue_date && <span className="mr-3">Issued {doc.issue_date}</span>}
                            {doc.expiry_date
                              ? <span>Expires {doc.expiry_date}</span>
                              : <span className="text-white/25">No expiry</span>
                            }
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {doc.file_name && (
                            <button
                              onClick={() => handleDownload(doc.id)}
                              title={`Download ${doc.file_name}`}
                              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button
                                onClick={() => openEdit(doc)}
                                className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(doc.id)}
                                disabled={deleting === doc.id}
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
                      <Plus className="w-3 h-3" /> Add document for {emp.employee_name.split(' ')[0]}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddDocumentDialog
        open={dialogOpen}
        employees={employees}
        editDoc={editDoc}
        defaultEmployeeId={dialogEmpId}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
