import ExcelJS from 'exceljs';
import { z } from 'zod';
import { ServiceLineEnum, CategoryEnum, SeasonEnum } from '../schema';

export interface FlatRow {
  contract_name: string;
  customer: string | null;
  year_index: number;
  service_line: z.infer<typeof ServiceLineEnum>;
  category: z.infer<typeof CategoryEnum>;
  line_code: string;
  label_en: string;
  label_ar: string | null;
  season: z.infer<typeof SeasonEnum>;
  qty: number;
  unit_cost: number;
  ctc_net: number | null;
  ctc_relievers: number | null;
  ctc_ot: number | null;
  ctc_training: number | null;
  ctc_insurance: number | null;
  ctc_medical: number | null;
  threshold_green: number | null;
  threshold_amber: number | null;
  notes: string | null;
}

export interface FlatParseResult {
  rows: FlatRow[];
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
}

const REQUIRED_COLS = [
  'contract_name', 'year_index', 'service_line', 'category',
  'line_code', 'label_en', 'qty', 'unit_cost',
];

const NULLABLE_NUM = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const NULLABLE_STR = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Parse a flat-template XLSX into normalized FlatRow[]. Validates header
 * shape; reports per-row errors without aborting the whole import. Caller
 * can show errors to the user and proceed with valid rows OR abort.
 *
 * v2 differences from v1:
 *   - `year_index` column required (was 'fiscal_year' in v1)
 *   - `contract_name` and `customer` columns required (was 'project' alone in v1)
 *   - 6 ctc_* columns added
 *   - threshold_green/amber columns added
 */
export async function parseFlatTemplate(filePath: string): Promise<FlatParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: [{ row: 0, message: 'No worksheet found' }], warnings: [] };
  }

  // Build header → column index map from row 1
  const headerRow = sheet.getRow(1);
  const colByName = new Map<string, number>();
  for (let c = 1; c <= sheet.columnCount; c++) {
    const v = headerRow.getCell(c).value;
    if (v != null) colByName.set(String(v).toLowerCase().trim(), c);
  }

  // Validate required headers
  const errors: Array<{ row: number; message: string }> = [];
  const missing = REQUIRED_COLS.filter(h => !colByName.has(h));
  if (missing.length) {
    return {
      rows: [],
      errors: [{ row: 1, message: `Missing required columns: ${missing.join(', ')}. Did you upload a v1 flat template? v2 requires: ${REQUIRED_COLS.join(', ')}` }],
      warnings: [],
    };
  }

  const get = (row: ExcelJS.Row, name: string): unknown => {
    const c = colByName.get(name);
    return c ? row.getCell(c).value : undefined;
  };

  const rows: FlatRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!get(row, 'contract_name') && !get(row, 'line_code')) continue; // skip blank
    try {
      const parsed: FlatRow = {
        contract_name: String(get(row, 'contract_name') ?? '').trim(),
        customer: NULLABLE_STR(get(row, 'customer')),
        year_index: Math.max(1, Math.round(Number(get(row, 'year_index') ?? 1))),
        service_line: ServiceLineEnum.parse(String(get(row, 'service_line') ?? '').trim().toLowerCase()),
        category: CategoryEnum.parse(String(get(row, 'category') ?? '').trim().toLowerCase()),
        line_code: String(get(row, 'line_code') ?? '').trim(),
        label_en: String(get(row, 'label_en') ?? '').trim(),
        label_ar: NULLABLE_STR(get(row, 'label_ar')),
        season: SeasonEnum.parse(String(get(row, 'season') ?? 'high').trim().toLowerCase() || 'high'),
        qty: Math.max(0, Number(get(row, 'qty') ?? 0)),
        unit_cost: Math.max(0, Number(get(row, 'unit_cost') ?? 0)),
        ctc_net: NULLABLE_NUM(get(row, 'ctc_net')),
        ctc_relievers: NULLABLE_NUM(get(row, 'ctc_relievers')),
        ctc_ot: NULLABLE_NUM(get(row, 'ctc_ot')),
        ctc_training: NULLABLE_NUM(get(row, 'ctc_training')),
        ctc_insurance: NULLABLE_NUM(get(row, 'ctc_insurance')),
        ctc_medical: NULLABLE_NUM(get(row, 'ctc_medical')),
        threshold_green: NULLABLE_NUM(get(row, 'threshold_green')),
        threshold_amber: NULLABLE_NUM(get(row, 'threshold_amber')),
        notes: NULLABLE_STR(get(row, 'notes')),
      };
      if (!parsed.contract_name) {
        errors.push({ row: r, message: 'contract_name is required' });
        continue;
      }
      if (!parsed.line_code || !parsed.label_en) {
        errors.push({ row: r, message: 'line_code and label_en are required' });
        continue;
      }
      rows.push(parsed);
    } catch (e) {
      errors.push({ row: r, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { rows, errors, warnings: [] };
}
