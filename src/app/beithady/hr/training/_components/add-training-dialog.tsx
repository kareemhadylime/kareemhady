// src/app/beithady/hr/training/_components/add-training-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload } from 'lucide-react';
import {
  addTrainingRecordAction,
  updateTrainingRecordAction,
  setTrainingRecordFileAction,
} from '@/lib/beithady/hr/hr-training-actions';
import { RECORD_TYPE_LABELS, RECORD_TYPES } from '@/lib/beithady/hr/hr-training-types';
import type { HrTrainingRecord, RecordType } from '@/lib/beithady/hr/hr-training-types';

type EmployeeOption = { id: string; company_id: string; display_name: string };

type Props = {
  open: boolean;
  employees: EmployeeOption[];
  editRecord?: HrTrainingRecord | null;
  defaultEmployeeId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function AddTrainingDialog({
  open, employees, editRecord, defaultEmployeeId, onClose, onSaved,
}: Props) {
  const isEdit = !!editRecord;

  const [employeeId, setEmployeeId]  = useState(defaultEmployeeId ?? editRecord?.employee_id ?? '');
  const [recordType, setRecordType]  = useState<RecordType>(editRecord?.record_type ?? 'training');
  const [title, setTitle]            = useState(editRecord?.title ?? '');
  const [date, setDate]              = useState(editRecord?.date ?? '');
  const [expiryDate, setExpiryDate]  = useState(editRecord?.expiry_date ?? '');
  const [notes, setNotes]            = useState(editRecord?.notes ?? '');
  const [file, setFile]              = useState<File | null>(null);
  const [error, setError]            = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() {
    setEmployeeId(defaultEmployeeId ?? '');
    setRecordType('training'); setTitle(''); setDate('');
    setExpiryDate(''); setNotes(''); setFile(null); setError('');
  }
  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!isEdit && !employeeId) { setError('Select an employee'); return; }
    if (!title.trim())           { setError('Title is required'); return; }

    startTransition(async () => {
      try {
        let recordId = editRecord?.id;

        if (isEdit) {
          const res = await updateTrainingRecordAction(editRecord!.id, {
            record_type: recordType, title, date, expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Update failed'); return; }
        } else {
          const res = await addTrainingRecordAction({
            employee_id: employeeId, record_type: recordType,
            title, date, expiry_date: expiryDate, notes,
          });
          if (!res.ok) { setError(res.error ?? 'Save failed'); return; }
          recordId = res.id;
        }

        if (file && recordId) {
          const params = new URLSearchParams({ record_id: recordId, filename: file.name });
          const urlRes = await fetch(`/api/hr/training/upload-url?${params}`);
          if (!urlRes.ok) { setError('Failed to get upload URL'); return; }
          const { signedUrl, filePath } = await urlRes.json() as { signedUrl: string; filePath: string };

          const uploadRes = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          });
          if (!uploadRes.ok) { setError('File upload failed'); return; }

          const fileRes = await setTrainingRecordFileAction(recordId, filePath, file.name);
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
            {isEdit ? 'Edit Record' : 'Add Training / Certification'}
          </h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Employee — add mode only */}
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

          {/* Record Type toggle */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Type</label>
            <div className="flex gap-2">
              {RECORD_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setRecordType(t)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                    recordType === t
                      ? 'bg-emerald-700 border-emerald-600 text-white font-semibold'
                      : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t === 'training' ? '🎓' : '🏅'} {RECORD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. First Aid Certificate, OSHA Safety Training"
              className="ix-input w-full" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
                {recordType === 'certification' ? 'Issue Date' : 'Completion Date'}
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ix-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="ix-input w-full" />
              <p className="text-xs text-white/30 mt-0.5">Leave blank if no expiry</p>
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
              Certificate / File {isEdit && editRecord?.file_name ? `(current: ${editRecord.file_name})` : '(optional)'}
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

          {/* Notes */}
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
            className="px-5 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
