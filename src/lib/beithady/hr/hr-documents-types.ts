// Pure types + helpers. No imports. Safe for any context.

export type DocType =
  | 'id'
  | 'contract'
  | 'police_report'
  | 'military_certificate'
  | 'other';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  id:                   'National ID',
  contract:             'Employment Contract',
  police_report:        'Police Report',
  military_certificate: 'Military Certificate',
  other:                'Other',
};

export const DOC_TYPES: DocType[] = [
  'id', 'contract', 'police_report', 'military_certificate', 'other',
];

// ── DB row ────────────────────────────────────────────────────────────────────

export type HrDocument = {
  id: string;
  employee_id: string;
  doc_type: DocType;
  title: string;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrDocumentRow = HrDocument & {
  employee_name: string;
  company_id: string;
  employee_phone: string | null;
};

export type EmployeeDocSummary = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  building_code: string | null;
  documents: HrDocument[];
};

// ── Form inputs ───────────────────────────────────────────────────────────────

export type AddDocumentInput = {
  employee_id: string;
  doc_type: DocType;
  title: string;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  notes: string;
};

export type UpdateDocumentInput = {
  doc_type?: DocType;
  title?: string;
  document_number?: string;
  issue_date?: string;
  expiry_date?: string;
  notes?: string;
};

// ── Expiry status ─────────────────────────────────────────────────────────────

export type ExpiryStatus =
  | 'expired'
  | 'critical'
  | 'warning'
  | 'upcoming'
  | 'valid'
  | 'no_expiry';

export const EXPIRY_STATUS_COLORS: Record<ExpiryStatus, string> = {
  expired:   'bg-red-900/50 text-red-300',
  critical:  'bg-red-900/50 text-red-300',
  warning:   'bg-amber-900/50 text-amber-300',
  upcoming:  'bg-blue-900/50 text-blue-300',
  valid:     'bg-emerald-900/50 text-emerald-300',
  no_expiry: 'bg-white/10 text-white/50',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + 'T00:00:00');
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

export function getExpiryStatus(expiryDate: string | null): ExpiryStatus {
  const days = daysUntilExpiry(expiryDate);
  if (days === null)  return 'no_expiry';
  if (days < 0)       return 'expired';
  if (days <= 7)      return 'critical';
  if (days <= 30)     return 'warning';
  if (days <= 60)     return 'upcoming';
  return 'valid';
}
