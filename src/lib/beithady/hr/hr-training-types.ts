// Pure types + helpers for training records and certifications.
// Expiry helpers (daysUntilExpiry, getExpiryStatus, EXPIRY_STATUS_COLORS)
// are intentionally NOT duplicated here — import from hr-documents-types.ts.

export type RecordType = 'training' | 'certification';

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  training:      'Training',
  certification: 'Certification',
};

export const RECORD_TYPE_ICONS: Record<RecordType, string> = {
  training:      '🎓',
  certification: '🏅',
};

export const RECORD_TYPES: RecordType[] = ['training', 'certification'];

// ── DB row ────────────────────────────────────────────────────────────────────

export type HrTrainingRecord = {
  id: string;
  employee_id: string;
  record_type: RecordType;
  title: string;
  date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrTrainingRecordRow = HrTrainingRecord & {
  employee_name: string;
  company_id: string;
  employee_phone: string | null;
};

export type EmployeeTrainingSummary = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  building_code: string | null;
  records: HrTrainingRecord[];
};

// ── Form inputs ───────────────────────────────────────────────────────────────

export type AddTrainingInput = {
  employee_id: string;
  record_type: RecordType;
  title: string;
  date: string;
  expiry_date: string;
  notes: string;
};

export type UpdateTrainingInput = {
  record_type?: RecordType;
  title?: string;
  date?: string;
  expiry_date?: string;
  notes?: string;
};

// ── Helper ────────────────────────────────────────────────────────────────────

export function formatTrainingDateRange(
  date: string | null,
  expiryDate: string | null
): string {
  if (!date && !expiryDate) return '—';
  if (date && !expiryDate)  return `Completed ${date}`;
  if (!date && expiryDate)  return `Expires ${expiryDate}`;
  return `${date} → ${expiryDate}`;
}
