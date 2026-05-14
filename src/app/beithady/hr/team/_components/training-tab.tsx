// src/app/beithady/hr/team/_components/training-tab.tsx
'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Download } from 'lucide-react';
import { getTrainingRecordDownloadUrl } from '@/lib/beithady/hr/hr-training-actions';
import {
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ICONS,
  formatTrainingDateRange,
} from '@/lib/beithady/hr/hr-training-types';
import {
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrTrainingRecord, RecordType } from '@/lib/beithady/hr/hr-training-types';

type Props = { employeeId: string };

export function TrainingTab({ employeeId }: Props) {
  const [records, setRecords] = useState<HrTrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/hr/training/by-employee?employee_id=${employeeId}`)
      .then(r => r.ok ? r.json() : { records: [] })
      .then(({ records: r }) => { setRecords(r ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [employeeId]);

  async function handleDownload(recordId: string) {
    const res = await getTrainingRecordDownloadUrl(recordId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  if (loading) {
    return <p className="text-sm text-white/30 py-4">Loading records…</p>;
  }

  return (
    <div className="space-y-3">
      {records.length === 0 ? (
        <p className="text-sm text-white/30 italic py-4">No training records on file.</p>
      ) : (
        records.map(rec => {
          const status = getExpiryStatus(rec.expiry_date);
          return (
            <div key={rec.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                {RECORD_TYPE_ICONS[rec.record_type as RecordType]} {RECORD_TYPE_LABELS[rec.record_type as RecordType]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{rec.title}</p>
                <p className="text-xs text-white/40">{formatTrainingDateRange(rec.date, rec.expiry_date)}</p>
              </div>
              {rec.file_name && (
                <button
                  onClick={() => handleDownload(rec.id)}
                  title={`Download ${rec.file_name}`}
                  className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })
      )}
      <a
        href="/beithady/hr/training"
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors mt-2"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Manage all training records
      </a>
    </div>
  );
}
