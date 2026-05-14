// src/lib/beithady/hr/hr-attendance-types.ts
// Pure types — no imports. Safe for any context.

export type AttendanceStatus = 'present' | 'absent';
export type AttendanceApprovalState = 'pending' | 'approved';
export type AttendanceMatchStatus = 'matched' | 'unmatched' | 'protected' | 'error';

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  building_code: string | null;
  approval_state: AttendanceApprovalState;
  submitted_by: string | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type AttendanceRow = {
  employee_id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  arabic_name: string | null;
  department: string;
  building_code: string | null;
  record_id: string | null;
  status: AttendanceStatus | null;
  approval_state: AttendanceApprovalState | null;
};

export type AttendancePreviewRow = {
  rowIndex: number;
  sheet_name: string;
  bh_id_raw: string;
  status_raw: string;
  status: AttendanceStatus | null;
  matchStatus: AttendanceMatchStatus;
  matchedEmployeeId: string | null;
  building_code: string | null;
  errorMessage: string;
};

export type AttendancePreviewResult = {
  rows: AttendancePreviewRow[];
  suggestedDate: string;
  matchedCount: number;
  unmatchedCount: number;
  protectedCount: number;
  errorCount: number;
};

export type AttendanceFilter = {
  date: string;
  building?: string;
  department?: string;
};
