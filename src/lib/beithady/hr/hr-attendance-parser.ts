// src/lib/beithady/hr/hr-attendance-parser.ts
// NOT server-only — imported by client preview and server actions.

import { matchEmployeeName } from './hr-payroll-parser';
import type { AttendancePreviewRow, AttendancePreviewResult, AttendanceStatus } from './hr-attendance-types';

export type AttendanceEmployeeStub = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  building_code: string | null;
};

export function normalizeAttendanceStatus(raw: string): AttendanceStatus | null {
  const s = raw.toLowerCase().trim();
  if (['present', 'p', '1', 'yes', 'y', 'حاضر'].includes(s)) return 'present';
  if (['absent', 'a', '0', 'no', 'n', 'غائب'].includes(s)) return 'absent';
  return null;
}

export function matchByBhId(
  bhId: string,
  employees: AttendanceEmployeeStub[]
): AttendanceEmployeeStub | null {
  const norm = bhId.trim().toUpperCase();
  if (!norm) return null;
  return employees.find(e => e.company_id.toUpperCase() === norm) ?? null;
}

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
  return String(v).trim();
}

export async function parseAttendanceFile(
  buffer: ArrayBuffer,
  employees: AttendanceEmployeeStub[],
  protectedEmployeeIds: Set<string>
): Promise<AttendancePreviewResult> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file');

  let headerRowNum = -1;
  const col: Record<string, number> = {};

  sheet.eachRow((row, rowNum) => {
    if (headerRowNum !== -1) return;
    const vals = row.values as unknown[];
    const lower = vals.map(v => safeStr(v).toLowerCase().replace(/[\s-]/g, ''));
    if (lower.some(v => ['name', 'bhid', 'status'].includes(v))) {
      headerRowNum = rowNum;
      lower.forEach((v, i) => {
        if (v === 'name')                  col.name   = i;
        if (v === 'bhid' || v === 'bhid')  col.bhid   = i;
        if (v === 'status')                col.status = i;
        if (v === 'date')                  col.date   = i;
      });
    }
  });

  if (headerRowNum === -1) {
    throw new Error('Could not find header row — expected columns: Name, BH-ID, Status');
  }

  const byBhId = new Map<string, AttendanceEmployeeStub>();
  for (const emp of employees) byBhId.set(emp.company_id.toUpperCase(), emp);

  const rows: AttendancePreviewRow[] = [];
  let suggestedDate = new Date().toISOString().slice(0, 10);

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;
    const vals = row.values as unknown[];

    const nameRaw   = safeStr(vals[col.name   ?? 1]);
    const bhIdRaw   = safeStr(vals[col.bhid   ?? 2]);
    const statusRaw = safeStr(vals[col.status ?? 3]);
    const dateRaw   = safeStr(vals[col.date   ?? 0]);

    if (!nameRaw && !bhIdRaw) return;

    if (dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) suggestedDate = dateRaw;

    const status = normalizeAttendanceStatus(statusRaw);

    let matched: AttendanceEmployeeStub | null = matchByBhId(bhIdRaw, employees);
    if (!matched && nameRaw) {
      const result = matchEmployeeName(nameRaw, employees);
      if (result.status === 'matched') {
        matched = employees.find(e => e.id === result.matchedId) ?? null;
      }
    }

    if (!matched) {
      rows.push({ rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
        status_raw: statusRaw, status, matchStatus: 'unmatched',
        matchedEmployeeId: null, building_code: null, errorMessage: 'Employee not found' });
      return;
    }

    if (!status) {
      rows.push({ rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
        status_raw: statusRaw, status: null, matchStatus: 'error',
        matchedEmployeeId: matched.id, building_code: matched.building_code,
        errorMessage: `Invalid status: "${statusRaw}" — use Present or Absent` });
      return;
    }

    if (protectedEmployeeIds.has(matched.id)) {
      rows.push({ rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
        status_raw: statusRaw, status, matchStatus: 'protected',
        matchedEmployeeId: matched.id, building_code: matched.building_code,
        errorMessage: 'Record approved — cannot overwrite' });
      return;
    }

    rows.push({ rowIndex: rowNum, sheet_name: nameRaw || bhIdRaw, bh_id_raw: bhIdRaw,
      status_raw: statusRaw, status, matchStatus: 'matched',
      matchedEmployeeId: matched.id, building_code: matched.building_code, errorMessage: '' });
  });

  return {
    rows, suggestedDate,
    matchedCount:   rows.filter(r => r.matchStatus === 'matched').length,
    unmatchedCount: rows.filter(r => r.matchStatus === 'unmatched').length,
    protectedCount: rows.filter(r => r.matchStatus === 'protected').length,
    errorCount:     rows.filter(r => r.matchStatus === 'error').length,
  };
}
