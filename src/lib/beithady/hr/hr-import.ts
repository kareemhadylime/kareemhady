// src/lib/beithady/hr/hr-import.ts
import type { ImportRow, ImportPreviewResult, BuildingCode, EmployeeStatus } from './hr-types';

// ── Analytic → BuildingCode mapping ───────────────────────────────────────

const ANALYTIC_MAP: [RegExp, BuildingCode | 'OTHER'][] = [
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
    if (re.test(s)) return code as BuildingCode;
  }
  return null;
}

// ── Red-row detection (for ExcelJS cell fill) ─────────────────────────────

export function isRedFill(argb: string): boolean {
  // ARGB hex: AA RR GG BB — check if it's a red-dominant fill
  if (argb.length < 8) return false;
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  return r > 180 && g < 100 && b < 100;
}

// ── Status inference ──────────────────────────────────────────────────────

export function inferStatus(isRedRow: boolean): EmployeeStatus {
  return isRedRow ? 'terminated' : 'on_job';
}

// ── Row validation ────────────────────────────────────────────────────────

export function validateRow(row: ImportRow): ImportRow {
  const errors: string[] = [];
  const incompleteFields: string[] = [];

  if (!row.first_name.trim()) errors.push('Name is required');
  if (!row.position.trim()) incompleteFields.push('position');
  if (!row.building_code) incompleteFields.push('building_code');
  if (row.salary_package < 0) errors.push('Salary must be ≥ 0');

  let validationState: ImportRow['validationState'] = 'ready';
  if (errors.length > 0) validationState = 'error';
  else if (incompleteFields.length > 0) validationState = 'incomplete';

  return { ...row, errors, incompleteFields, validationState };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: unknown }).text);
  return String(v).trim();
}

// ── XLSX parsing ──────────────────────────────────────────────────────────

/**
 * Parse an XLSX file buffer from the April salary sheet format.
 * Uses ExcelJS to read cell values and background fill colors (for red-row = terminated detection).
 *
 * Expected columns (order flexible, header row detected by "Name" presence):
 *   Name, JobTitle, S.Package, Transportation Allowance, Bonus, Analytic
 */
export async function parseImportFile(buffer: ArrayBuffer): Promise<ImportPreviewResult> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file');

  // Find header row (first row containing a cell with value "Name")
  let headerRowNum = -1;
  const colIndex: Record<string, number> = {};

  sheet.eachRow((row, rowNum) => {
    if (headerRowNum !== -1) return;
    const vals = row.values as unknown[];
    const lower = vals.map(v => safeStr(v).toLowerCase());
    if (lower.some(v => v === 'name')) {
      headerRowNum = rowNum;
      lower.forEach((v, i) => {
        if (v === 'name')                              colIndex.name = i;
        if (v === 'jobtitle' || v === 'job title')     colIndex.jobTitle = i;
        if (v.includes('s.pack') || v === 'salary package') colIndex.sPackage = i;
        if (v.includes('transport'))                   colIndex.transport = i;
        if (v === 'bonus')                             colIndex.bonus = i;
        if (v === 'analytic')                          colIndex.analytic = i;
      });
    }
  });

  if (headerRowNum === -1) {
    throw new Error('Could not find header row — expected a row with a "Name" column');
  }

  const rows: ImportRow[] = [];

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const vals = row.values as unknown[];
    const name = safeStr(vals[colIndex.name ?? 1]);
    if (!name) return; // Skip blank rows

    // Detect red background on any of the first 3 cells
    let redRow = false;
    for (let c = 1; c <= Math.min(row.cellCount, 3); c++) {
      const fill = row.getCell(c).fill;
      if (
        fill &&
        fill.type === 'pattern' &&
        'fgColor' in fill &&
        (fill as { fgColor?: { argb?: string } }).fgColor?.argb
      ) {
        const argb = (fill as { fgColor: { argb: string } }).fgColor.argb;
        if (isRedFill(argb)) { redRow = true; break; }
      }
    }

    const analytic = safeStr(vals[colIndex.analytic ?? 0]);
    const buildingCode = mapAnalyticToBuilding(analytic);

    const raw: ImportRow = {
      rowIndex: rowNum,
      first_name: name,
      position: safeStr(vals[colIndex.jobTitle ?? 0]),
      salary_package: safeNum(vals[colIndex.sPackage ?? 0]),
      building_code: buildingCode,
      transport_allowance: safeNum(vals[colIndex.transport ?? 0]),
      fixed_bonus: safeNum(vals[colIndex.bonus ?? 0]),
      status: inferStatus(redRow),
      isRedRow: redRow,
      validationState: 'ready',
      errors: [],
      incompleteFields: [],
    };

    rows.push(validateRow(raw));
  });

  return {
    rows,
    readyCount: rows.filter(r => r.validationState === 'ready').length,
    incompleteCount: rows.filter(r => r.validationState === 'incomplete').length,
    errorCount: rows.filter(r => r.validationState === 'error').length,
  };
}
