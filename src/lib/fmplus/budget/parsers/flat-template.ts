import ExcelJS from 'exceljs';
import { ServiceLineSchema, SeasonSchema } from '../schema';

export const FLAT_HEADERS = [
  'project', 'service_line', 'sub_location', 'category',
  'line_code', 'season', 'qty', 'unit_cost', 'notes',
] as const;

export type FlatRow = {
  project: string;
  service_line: string;
  sub_location: string | null;
  category: string;
  line_code: string;
  season: 'high' | 'low';
  qty: number;
  unit_cost: number;
  notes: string | null;
};

export type FlatRowError = { row: number; field: string; message: string };

export type FlatParseResult = {
  rows: FlatRow[];
  errors: FlatRowError[];
};

export async function parseFlatBudgetXlsx(buf: Buffer | ArrayBuffer): Promise<FlatParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, field: '', message: 'No worksheet' }] };

  const headerRow = ws.getRow(1);
  const headerMap = new Map<string, number>();
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const v = String(headerRow.getCell(c).value ?? '').trim().toLowerCase();
    if (v) headerMap.set(v, c);
  }
  for (const required of ['project', 'service_line', 'category', 'line_code', 'season', 'qty', 'unit_cost'] as const) {
    if (!headerMap.has(required)) {
      return { rows: [], errors: [{ row: 1, field: required, message: `Missing required header: ${required}` }] };
    }
  }

  const rows: FlatRow[] = [];
  const errors: FlatRowError[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (h: string) => {
      const c = headerMap.get(h);
      return c ? row.getCell(c).value : null;
    };
    const project = String(get('project') ?? '').trim();
    const service_line = String(get('service_line') ?? '').trim();
    const sub_location = (() => { const v = String(get('sub_location') ?? '').trim(); return v === '' ? null : v; })();
    const category = String(get('category') ?? '').trim();
    const line_code = String(get('line_code') ?? '').trim();
    const season = String(get('season') ?? '').trim();
    const qtyRaw = get('qty');
    const unitRaw = get('unit_cost');
    const notes = (() => { const v = String(get('notes') ?? '').trim(); return v === '' ? null : v; })();

    if (!project)      { errors.push({ row: r, field: 'project',      message: 'Required' }); continue; }
    if (!service_line) { errors.push({ row: r, field: 'service_line', message: 'Required' }); continue; }
    if (!ServiceLineSchema.safeParse(service_line).success) {
      errors.push({ row: r, field: 'service_line', message: `Unknown service_line "${service_line}"` }); continue;
    }
    if (!category)     { errors.push({ row: r, field: 'category',     message: 'Required' }); continue; }
    if (!line_code)    { errors.push({ row: r, field: 'line_code',    message: 'Required' }); continue; }
    if (!SeasonSchema.safeParse(season).success) {
      errors.push({ row: r, field: 'season', message: `Season must be "high" or "low", got "${season}"` }); continue;
    }
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      errors.push({ row: r, field: 'qty', message: `qty must be ≥ 0, got "${qtyRaw}"` }); continue;
    }
    const unit_cost = Number(unitRaw);
    if (!Number.isFinite(unit_cost) || unit_cost < 0) {
      errors.push({ row: r, field: 'unit_cost', message: `unit_cost must be ≥ 0, got "${unitRaw}"` }); continue;
    }
    rows.push({
      project, service_line, sub_location, category, line_code,
      season: season as 'high' | 'low', qty, unit_cost, notes,
    });
  }
  return { rows, errors };
}
