// src/lib/beithady/hr/hr-import.ts
import type {
  ImportRow, ImportPreviewResult,
  BuildingCode, EmployeeStatus, Department, ContractType, PaymentMethod,
} from './hr-types';

// ── Analytic / Building mapping ───────────────────────────────────────────────

const ANALYTIC_MAP: [RegExp, BuildingCode][] = [
  [/lotus\s*26/i,        'BH-26'],
  [/lotus\s*73/i,        'BH-73'],
  [/a1\s*hospitality/i,  'BH-435'],
  [/one\s*katt?ameya/i,  'BH-OK'],
  [/head\s*office/i,     'HEAD_OFFICE'],
  [/el[- ]?go[nu]a/i,    'OTHER'],
];

export function mapAnalyticToBuilding(analytic: string): BuildingCode | null {
  const s = analytic.trim();
  for (const [re, code] of ANALYTIC_MAP) {
    if (re.test(s)) return code;
  }
  return null;
}

// ── Red-row detection ─────────────────────────────────────────────────────────

export function isRedFill(argb: string): boolean {
  if (argb.length < 8) return false;
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  return r > 180 && g < 100 && b < 100;
}

// ── Value parsers ─────────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: unknown }).text);
  return String(v).trim();
}

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

function parseGender(s: string): 'male' | 'female' | null {
  const l = s.toLowerCase();
  if (l === 'male' || l === 'ذكر') return 'male';
  if (l === 'female' || l === 'أنثى') return 'female';
  return null;
}

function parseStatus(s: string): EmployeeStatus | null {
  const map: Record<string, EmployeeStatus> = {
    'on job': 'on_job', 'on_job': 'on_job',
    'probation': 'probation',
    'on leave': 'on_leave', 'on_leave': 'on_leave',
    'suspended': 'suspended',
    'terminated': 'terminated',
  };
  return map[s.toLowerCase()] ?? null;
}

function parseDepartment(s: string): Department | null {
  const map: Record<string, Department> = {
    'executive': 'executive',
    'finance': 'finance',
    'reservations': 'reservations',
    'real estate': 'real_estate',
    'real estate & acquisitions': 'real_estate',
    'engineering': 'engineering',
    'engineering & design': 'engineering',
    'operations': 'operations',
    'housekeeping': 'housekeeping',
    'security': 'security',
    'maintenance': 'maintenance',
    'front of house': 'front_of_house',
    'drivers': 'drivers',
    'storekeeping': 'storekeeping',
    'lifeguard': 'lifeguard',
  };
  return map[s.toLowerCase()] ?? null;
}

function parseContractType(s: string): ContractType | null {
  const map: Record<string, ContractType> = {
    'permanent': 'permanent',
    'fixed term': 'fixed_term', 'fixed_term': 'fixed_term',
    'hourly': 'hourly',
  };
  return map[s.toLowerCase()] ?? null;
}

function parsePaymentMethod(s: string): PaymentMethod | null {
  const l = s.toLowerCase();
  if (l === 'bank') return 'bank';
  if (l === 'cash') return 'cash';
  return null;
}

// ── Row validation ────────────────────────────────────────────────────────────

export function validateRow(row: ImportRow): ImportRow {
  const errors: string[] = [];
  const incompleteFields: string[] = [...row.incompleteFields];

  if (!row.first_name.trim()) errors.push('Name is required');
  if (!row.position.trim()) incompleteFields.push('position');
  if (!row.building_code) incompleteFields.push('building_code');
  if (row.salary_package < 0) errors.push('Salary must be ≥ 0');
  if (!row.national_id) incompleteFields.push('national_id');
  if (!row.phone) incompleteFields.push('phone');
  if (!row.date_of_birth) incompleteFields.push('date_of_birth');
  if (!row.date_joined) incompleteFields.push('date_joined');

  const unique = [...new Set(incompleteFields)];
  let validationState: ImportRow['validationState'] = 'ready';
  if (errors.length > 0) validationState = 'error';
  else if (unique.length > 0) validationState = 'incomplete';

  return { ...row, errors, incompleteFields: unique, validationState };
}

// ── XLSX parsing ──────────────────────────────────────────────────────────────

/**
 * Parse an XLSX file buffer.
 *
 * Supports two formats:
 *  1. The new full-detail template (Name, Arabic Name, National ID, Date of Birth,
 *     Gender, Phone, Email, Department, Position, Building, Date Joined, Status,
 *     Salary Package, Transportation Allowance, Fixed Bonus, Contract Type,
 *     Payment Method, Bank IBAN)
 *  2. The legacy Odoo salary sheet (Name, JobTitle, S.Package,
 *     Transportation Allowance, Bonus, Analytic)
 *
 * Column order is flexible; the header row is detected by finding a "Name" cell.
 * Red-highlighted rows are auto-detected as Terminated status.
 */
export async function parseImportFile(buffer: ArrayBuffer): Promise<ImportPreviewResult> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file');

  // Find header row — first row containing a cell with value exactly "Name"
  let headerRowNum = -1;
  const col: Record<string, number> = {};

  sheet.eachRow((row, rowNum) => {
    if (headerRowNum !== -1) return;
    const vals = row.values as unknown[];
    const lower = vals.map(v => safeStr(v).toLowerCase());
    if (!lower.some(v => v === 'name')) return;

    headerRowNum = rowNum;
    lower.forEach((v, i) => {
      if (v === 'name')                                     col.name = i;
      // New template columns
      if (v === 'arabic name')                              col.arabicName = i;
      if (v === 'national id' || v === 'national_id')      col.nationalId = i;
      if (v === 'date of birth' || v === 'date_of_birth')  col.dateOfBirth = i;
      if (v === 'gender')                                   col.gender = i;
      if (v === 'phone')                                    col.phone = i;
      if (v === 'email')                                    col.email = i;
      if (v === 'department')                               col.department = i;
      if (v === 'position')                                 col.position = i;
      if (v === 'building')                                 col.building = i;
      if (v === 'date joined' || v === 'date_joined')       col.dateJoined = i;
      if (v === 'status')                                   col.status = i;
      if (v === 'salary package' || v.includes('s.pack'))   col.sPackage = i;
      if (v.includes('transport'))                          col.transport = i;
      if (v === 'fixed bonus' || v === 'bonus')             col.bonus = i;
      if (v === 'contract type' || v === 'contract_type')   col.contractType = i;
      if (v === 'payment method' || v === 'payment_method') col.paymentMethod = i;
      if (v === 'bank iban' || v === 'bank_iban')           col.bankIban = i;
      // Legacy Odoo sheet columns
      if (v === 'jobtitle' || v === 'job title')            col.jobTitle = i;
      if (v === 'analytic')                                 col.analytic = i;
    });
  });

  if (headerRowNum === -1) {
    throw new Error('Could not find header row — expected a row with a "Name" column');
  }

  const rows: ImportRow[] = [];

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const vals = row.values as unknown[];
    const name = safeStr(vals[col.name ?? 1]);
    if (!name) return;

    // Detect red background on any of the first 3 cells (= terminated in old format)
    let redRow = false;
    for (let c = 1; c <= Math.min(row.cellCount, 3); c++) {
      const fill = row.getCell(c).fill;
      if (
        fill?.type === 'pattern' &&
        'fgColor' in fill &&
        (fill as { fgColor?: { argb?: string } }).fgColor?.argb
      ) {
        const argb = (fill as { fgColor: { argb: string } }).fgColor.argb;
        if (isRedFill(argb)) { redRow = true; break; }
      }
    }

    // Building — new "Building" column takes precedence over legacy "Analytic"
    const buildingRaw  = col.building  != null ? safeStr(vals[col.building])  : '';
    const analyticRaw  = col.analytic  != null ? safeStr(vals[col.analytic])  : '';
    const buildingCode = mapAnalyticToBuilding(buildingRaw || analyticRaw);

    // Status — explicit "Status" column overrides red-row detection
    const statusRaw = col.status != null ? safeStr(vals[col.status]) : '';
    const parsedStatus = parseStatus(statusRaw);
    const status: EmployeeStatus = redRow ? 'terminated' : (parsedStatus ?? 'on_job');

    // Position — new "Position" column or legacy "JobTitle"
    const posRaw =
      col.position != null ? safeStr(vals[col.position]) :
      col.jobTitle  != null ? safeStr(vals[col.jobTitle])  : '';

    const raw: ImportRow = {
      rowIndex:          rowNum,
      first_name:        name,
      arabic_name:       col.arabicName  != null ? safeStr(vals[col.arabicName])  || null : null,
      national_id:       col.nationalId  != null ? safeStr(vals[col.nationalId])  || null : null,
      date_of_birth:     col.dateOfBirth != null ? safeStr(vals[col.dateOfBirth]) || null : null,
      gender:            col.gender      != null ? parseGender(safeStr(vals[col.gender]))          : null,
      phone:             col.phone       != null ? safeStr(vals[col.phone])       || null : null,
      email:             col.email       != null ? safeStr(vals[col.email])       || null : null,
      department:        col.department  != null ? parseDepartment(safeStr(vals[col.department]))  : null,
      position:          posRaw,
      salary_package:    safeNum(col.sPackage    != null ? vals[col.sPackage]    : 0),
      building_code:     buildingCode,
      date_joined:       col.dateJoined  != null ? safeStr(vals[col.dateJoined]) || null : null,
      status,
      transport_allowance: safeNum(col.transport != null ? vals[col.transport]   : 0),
      fixed_bonus:         safeNum(col.bonus     != null ? vals[col.bonus]       : 0),
      contract_type:     col.contractType  != null ? parseContractType(safeStr(vals[col.contractType]))   : null,
      payment_method:    col.paymentMethod != null ? parsePaymentMethod(safeStr(vals[col.paymentMethod])) : null,
      bank_iban:         col.bankIban     != null ? safeStr(vals[col.bankIban])  || null : null,
      isRedRow:          redRow,
      validationState:   'ready',
      errors:            [],
      incompleteFields:  [],
    };

    rows.push(validateRow(raw));
  });

  return {
    rows,
    readyCount:      rows.filter(r => r.validationState === 'ready').length,
    incompleteCount: rows.filter(r => r.validationState === 'incomplete').length,
    errorCount:      rows.filter(r => r.validationState === 'error').length,
  };
}
