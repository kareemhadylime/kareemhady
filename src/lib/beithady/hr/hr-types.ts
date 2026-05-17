// src/lib/beithady/hr/hr-types.ts
// Pure types + enum constants. No imports — safe to use in any context.

export const DEPARTMENTS = [
  'executive', 'finance', 'reservations', 'real_estate', 'engineering',
  'operations', 'housekeeping', 'security', 'maintenance',
  'front_of_house', 'drivers', 'storekeeping', 'lifeguard',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  executive:     'Executive',
  finance:       'Finance',
  reservations:  'Reservations',
  real_estate:   'Real Estate & Acquisitions',
  engineering:   'Engineering & Design',
  operations:    'Operations',
  housekeeping:  'Housekeeping',
  security:      'Security',
  maintenance:   'Maintenance',
  front_of_house:'Front of House',
  drivers:       'Drivers',
  storekeeping:  'Storekeeping',
  lifeguard:     'Lifeguard',
};

export const JOB_ROLES = [
  'owner_director', 'manager', 'supervisor', 'accountant',
  'reservation_agent', 'housekeeper', 'hk_supervisor', 'security_guard',
  'maintenance_tech', 'receptionist', 'driver', 'storekeeper',
  'architect', 'property_officer', 'lifeguard',
] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const JOB_ROLE_LABELS: Record<JobRole, string> = {
  owner_director:   'Owner / Director',
  manager:          'Manager',
  supervisor:       'Supervisor',
  accountant:       'Accountant',
  reservation_agent:'Reservation Agent',
  housekeeper:      'Housekeeper',
  hk_supervisor:    'HK Supervisor',
  security_guard:   'Security Guard',
  maintenance_tech: 'Maintenance Technician',
  receptionist:     'Receptionist',
  driver:           'Driver',
  storekeeper:      'Storekeeper',
  architect:        'Architect / Designer',
  property_officer: 'Property Officer',
  lifeguard:        'Lifeguard',
};

export const EMPLOYEE_STATUSES = [
  'on_job', 'probation', 'on_leave', 'suspended', 'terminated',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  on_job:     'On Job',
  probation:  'Probation',
  on_leave:   'On Leave',
  suspended:  'Suspended',
  terminated: 'Terminated',
};

export const BUILDING_CODES = [
  'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'HEAD_OFFICE', 'OTHER',
] as const;
export type BuildingCode = (typeof BUILDING_CODES)[number];

export const BUILDING_LABELS: Record<BuildingCode, string> = {
  'BH-26':      'BH-26 (Lotus 26)',
  'BH-73':      'BH-73 (Lotus 73)',
  'BH-435':     'BH-435 (A1 Hospitality)',
  'BH-OK':      'BH-OK (One Katameya)',
  HEAD_OFFICE:  'Head Office',
  OTHER:        'Other',
};

export const CONTRACT_TYPES = ['permanent', 'fixed_term', 'hourly'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const PAYMENT_METHODS = ['bank', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EVENT_TYPES = [
  'hired', 'status_change', 'salary_change',
  'building_transfer', 'role_change', 'terminated',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ── DB row shapes ──────────────────────────────────────────────────────────

export type HrEmployee = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  arabic_name: string | null;
  national_id: string | null;
  date_of_birth: string | null;   // ISO YYYY-MM-DD
  gender: 'male' | 'female' | null;
  department: Department;
  position: string;
  job_role: JobRole;
  status: EmployeeStatus;
  date_joined: string | null;
  date_terminated: string | null;
  termination_reason: string | null;
  phone: string | null;
  email: string | null;
  portrait_url: string | null;
  incomplete_fields: string[];
  payslip_language: 'arabic' | 'english';
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type HrContract = {
  id: string;
  employee_id: string;
  contract_type: ContractType;
  contract_start: string;
  contract_end: string | null;
  building_code: BuildingCode;
  salary_package: number;
  transport_allowance: number;
  travel_allowance: number;
  fixed_bonus: number;
  bank_name: string | null;
  bank_account: string | null;
  bank_iban: string | null;
  payment_method: PaymentMethod;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string | null;
};

export type HrEvent = {
  id: string;
  employee_id: string;
  event_type: EventType;
  event_date: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

// Joined view model used by the roster and dialog
export type HrEmployeeRow = HrEmployee & {
  current_contract: HrContract | null;
  contract_history: HrContract[];
};

// ── Form input shapes ──────────────────────────────────────────────────────

export type PersonalInfoInput = {
  first_name: string;
  last_name: string;
  arabic_name: string;
  national_id: string;
  date_of_birth: string;
  gender: 'male' | 'female' | '';
  department: Department | '';
  position: string;
  job_role: JobRole | '';
  status: EmployeeStatus;
  date_joined: string;
  date_terminated: string;
  termination_reason: string;
  phone: string;
  email: string;
  portrait_url: string;
  payslip_language: 'arabic' | 'english';
};

export type ContractInput = {
  contract_type: ContractType;
  contract_start: string;
  contract_end: string;
  building_code: BuildingCode | '';
  salary_package: string;       // string in form → parsed to number in action
  transport_allowance: string;
  travel_allowance: string;
  fixed_bonus: string;
  bank_name: string;
  bank_account: string;
  bank_iban: string;
  payment_method: PaymentMethod;
};

// ── Import shapes ──────────────────────────────────────────────────────────

export type ImportRow = {
  rowIndex: number;
  first_name: string;
  arabic_name: string | null;
  national_id: string | null;
  date_of_birth: string | null;
  gender: 'male' | 'female' | null;
  phone: string | null;
  email: string | null;
  department: Department | null;
  position: string;
  salary_package: number;
  building_code: BuildingCode | null;
  date_joined: string | null;
  status: EmployeeStatus;
  transport_allowance: number;
  fixed_bonus: number;
  contract_type: ContractType | null;
  payment_method: PaymentMethod | null;
  bank_iban: string | null;
  validationState: 'ready' | 'incomplete' | 'error';
  errors: string[];
  incompleteFields: string[];
  isRedRow: boolean;
};

export type ImportPreviewResult = {
  rows: ImportRow[];
  readyCount: number;
  incompleteCount: number;
  errorCount: number;
};
