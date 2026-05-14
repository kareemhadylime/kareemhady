// src/lib/beithady/hr/hr-leave-ot-types.ts
// Pure types + helpers. No imports. Safe for any context.

export type LeaveType = 'annual' | 'sick' | 'emergency';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual:    'Annual Leave',
  sick:      'Sick Leave',
  emergency: 'Emergency Leave',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export type LeaveBalance = {
  id: string;
  employee_id: string;
  year: number;
  leave_type: LeaveType;
  total_days: number;
  used_days: number;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

export type OvertimeRecord = {
  id: string;
  employee_id: string;
  date: string;
  hours: number;
  reason: string | null;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

export type LeaveRequestRow = LeaveRequest & {
  employee_name: string;
  company_id: string;
};

export type OvertimeRecordRow = OvertimeRecord & {
  employee_name: string;
  company_id: string;
};

export type LeaveBalanceRow = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
};

export type AddLeaveInput = {
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
};

export type LogOtInput = {
  employee_id: string;
  date: string;
  hours: number;
  reason: string;
};

/**
 * Calendar days between start and end, inclusive.
 * Returns 0 if end is before start.
 */
export function calcLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
