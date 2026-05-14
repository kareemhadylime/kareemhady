'use client';

import { useState, useTransition } from 'react';
import { X, Upload } from 'lucide-react';
import {
  addDocumentAction,
  updateDocumentAction,
  setDocumentFileAction,
} from '@/lib/beithady/hr/hr-documents-actions';
import { DOC_TYPE_LABELS, DOC_TYPES } from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocument, DocType } from '@/lib/beithady/hr/hr-documents-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  editDoc?: HrDocument | null;
  defaultEmployeeId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function AddDocumentDialog({
  open, employees, editDoc, defaultEmployeeId, onClose, onSaved,
}: Props) {
  const isEdit = !!editDoc;

  const [employeeId, setEmployeeId]  = useState(defaultEmployeeId ?? editDoc?.employee_id ?? '');
  const [docType, setDocType]        = useState<DocType>(editDoc?.doc_type ?? 'id');
  const [title, setTitle]            = useState(editDoc?.title ?? '');
  const [docNumber, setDocNumber]    = useState(editDoc?.document_number ?? '');
  const [issueDate, setIssueDate]    = useState(editDoc?.issue_date ?? '');
  const [expiryDate, setExpiryDate]  = useState(editDoc?.expiry_date ?? '');
  const [notes, setNotes]            = useState(editDoc?.notes ?? '');
  const [file, setFile]              = useState<File | null>(null);
  const [error, setError]            = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() {
    setEmployeeId(defaultEmployeeId ?? '');
    setDocType('id'); setTitle(''); setDocNumber('');
    setIssueDate(''); setExpiryDate(''); setNotes('');
    setFile(null); setError('');
  }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!isEdit && !employeeId) { setError('Select an employee'); return; }
    if (!title.trim())           { setError('Title is required'); return; }

    startTransition(async () => {
      try {
        let docId = editDoc?.id;

        if (isEdit) {
          const res = await updateDocumentAction(editDoc!.id, {
            doc_type: docType, title, document_number: docNumber,
            issue_date: issueDate, expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Update failed'); return; }
        } else {
          const res = await addDocumentAction({
            employee_id: employeeId, doc_type: docType, title,
            document_number: docNumber, issue_date: issueDate,
            expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Save failed'); return; }
          docId = res.id;
        }

        if (file && docId) {
          const params = new URLSearchParams({ doc_id: docId, filename: file.name });
          const urlRes = await fetch(`/api/hr/documents/upload-url?${params}`);
          if (!urlRes.ok) { setError('Failed to get upload URL'); return; }
          const { signedUrl, filePath } = await urlRes.json() as { signedUrl: string; filePath: string };

          const uploadRes = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          });
          if (!uploadRes.ok) { setError('File upload failed'); return; }

          const fileRes = await setDocumentFileAction(docId, filePath, file.name);
          if (!fileRes.ok) { setError(fileRes.error ?? 'Failed to save file path'); return; }
        }

        reset();
        onSaved();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-neutral-900">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Edit Document' : 'Add Document'}
          </h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Employee</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="ix-input w-full">
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.display_name} ({e.company_id})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value as DocType)} className="ix-input w-full">
              {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. National ID — Mohamed Ali" className="ix-input w-full" />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Document Number (optional)</label>
            <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)}
              placeholder="ID number, contract ref, etc." className="ix-input w-full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Issue Date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="ix-input w-full" />
              <p className="text-xs text-white/30 mt-0.5">Leave blank if no expiry</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
              File {isEdit && editDoc?.file_name ? `(current: ${editDoc.file_name})` : '(optional)'}
            </label>
            <label className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
              <Upload className="w-4 h-4 text-white/40" />
              <span className="text-sm text-white/60">{file ? file.name : 'Choose file (PDF, JPG, PNG — max 10 MB)'}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && f.size <= 10 * 1024 * 1024) { setFile(f); setError(''); }
                  else if (f) setError('File must be ≤10 MB');
                }}
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} className="ix-input w-full resize-none" />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3 sticky bottom-0 bg-neutral-900">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Document'}
          </button>
        </div>
      </div>
    </div>
  );
}
