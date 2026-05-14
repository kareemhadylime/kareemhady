'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Download } from 'lucide-react';
import { getDocumentDownloadUrl } from '@/lib/beithady/hr/hr-documents-actions';
import {
  DOC_TYPE_LABELS,
  getExpiryStatus,
  EXPIRY_STATUS_COLORS,
} from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocument, DocType } from '@/lib/beithady/hr/hr-documents-types';

type Props = {
  employeeId: string;
  canManage: boolean;
};

export function DocumentsTab({ employeeId, canManage: _canManage }: Props) {
  const [docs, setDocs]       = useState<HrDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/hr/documents/by-employee?employee_id=${employeeId}`)
      .then(r => r.ok ? r.json() : { docs: [] })
      .then(({ docs: d }) => { setDocs(d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [employeeId]);

  async function handleDownload(docId: string) {
    const res = await getDocumentDownloadUrl(docId);
    if (res.ok && res.url) window.open(res.url, '_blank');
  }

  if (loading) {
    return <p className="text-sm text-white/30 py-4">Loading documents…</p>;
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <p className="text-sm text-white/30 italic py-4">No documents on file.</p>
      ) : (
        docs.map(doc => {
          const status = getExpiryStatus(doc.expiry_date);
          return (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${EXPIRY_STATUS_COLORS[status]}`}>
                {DOC_TYPE_LABELS[doc.doc_type as DocType]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{doc.title}</p>
                <p className="text-xs text-white/40">
                  {doc.expiry_date
                    ? `Expires ${doc.expiry_date}`
                    : <span className="text-white/25">No expiry</span>
                  }
                </p>
              </div>
              {doc.file_name && (
                <button
                  onClick={() => handleDownload(doc.id)}
                  title={`Download ${doc.file_name}`}
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
        href="/beithady/hr/documents"
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors mt-2"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Manage all documents
      </a>
    </div>
  );
}
