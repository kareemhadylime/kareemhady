import ExcelJS from 'exceljs';
import type { ServiceLine, Category } from '../types';

export interface ParsedTrioRow {
  service_line: ServiceLine;
  category: Category;
  line_code: string;
  label_en: string;
  label_ar: string | null;
  qty: number;
  unit_cost: number;
  ctc_net: number | null;
  ctc_relievers: number | null;
  ctc_ot: number | null;
  ctc_training: number | null;
  ctc_insurance: number | null;
  ctc_medical: number | null;
}

export interface ParseTrioResult {
  contract_name: string;
  rows: ParsedTrioRow[];
  warnings: string[];
  errors: Array<{ sheet: string; row: number; message: string }>;
  /** Sheets that this v2.1 parser intentionally skipped (BOQ + Light Tools). */
  skippedSheets: string[];
}

const BUDGET_SHEET_TO_SERVICE: Record<string, ServiceLine> = {
  'HK Budget':            'hk',
  'MEP Budget':           'mep',
  'LS Budget':            'landscape',
  'Pest Control Budget':  'pest_ctrl',
  'Back Office Budget':   'back_office',
};

const SKIPPABLE_LABELS = new Set(['public', 'private', 'manpower', 'boq', 'category', 'subtotal', 'total']);

/**
 * Regex for BOQ / indirect / equipment item-number prefixes in the Position column.
 * Rows like "2.1 | Uniform" or "4.1 | Sweeper" are non-manning sections — skip them.
 * Also matches section headers like "List Of Indirects" or "Project OVH & GM".
 */
const NON_MANNING_POSITION_RE = /^\d+\.\d+/;

const COL = {
  num: 2,
  position: 3,
  hours: 4,
  net_rate: 5,
  ctc_rate: 6,
  hc_required: 7,
  hc_budgeted: 8,
};

function unwrapValue(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const obj = v as { result?: unknown; value?: unknown };
    if ('result' in obj) return unwrapValue(obj.result);
    if ('value' in obj) return unwrapValue(obj.value);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function unwrapString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && v !== null) {
    const obj = v as { result?: unknown; value?: unknown; richText?: Array<{ text?: string }> };
    if (Array.isArray(obj.richText)) return obj.richText.map(t => t.text ?? '').join('').trim();
    if ('result' in obj) return unwrapString(obj.result);
    if ('value' in obj) return unwrapString(obj.value);
  }
  return String(v).trim();
}

function deriveLineCode(name: string, prefix: string): string {
  return prefix + '_' + name.toLowerCase()
    .replace(/[()/&,]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 32);
}

export async function parseTrioStyle(filePath: string): Promise<ParseTrioResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const rows: ParsedTrioRow[] = [];
  const warnings: string[] = [];
  const errors: Array<{ sheet: string; row: number; message: string }> = [];
  const skippedSheets: string[] = [];
  const seenCodes = new Set<string>();

  for (const sheet of wb.worksheets) {
    const sheetName = sheet.name;
    if (!(sheetName in BUDGET_SHEET_TO_SERVICE)) {
      // Track skippable BOQ / Light Tools sheets
      if (/budget|boq|tools|cons/i.test(sheetName)) skippedSheets.push(sheetName);
      continue;
    }

    const service_line = BUDGET_SHEET_TO_SERVICE[sheetName];
    const prefixMap: Record<ServiceLine, string> = {
      hk: 'hk_mng',
      mep: 'mep_mng',
      landscape: 'ls_mng',
      security: 'sec_mng',
      pest_ctrl: 'pest_mng',
      waste_mgmt: 'waste_mng',
      back_office: 'bo_mng',
    };
    const prefix = prefixMap[service_line];

    // Walk data rows starting at row 5 (row 4 is the header per inspection)
    let rowsAdded = 0;
    for (let r = 5; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      // Col 2 is the line-number / item-number column. In the manning section it holds
      // integers (1, 2, 3, …) or is empty. In equipment/indirect sections it holds
      // numbered codes like "2.1", "3.1", "4.1". Skip those.
      const col2 = unwrapString(row.getCell(COL.num).value);
      if (NON_MANNING_POSITION_RE.test(col2)) continue;

      const position = unwrapString(row.getCell(COL.position).value);
      if (!position) continue;
      const lower = position.toLowerCase();
      if (SKIPPABLE_LABELS.has(lower)) continue;
      // Skip numbered BOQ/indirect items (e.g. "2.1 | Uniform") and section headers
      if (NON_MANNING_POSITION_RE.test(position)) continue;
      // Skip obvious section header rows (List Of Indirects, List Of Heavy Equipment, etc.)
      if (/^list of|project ovh|total manpower|working hours|position/i.test(position)) continue;

      const ctcRate = unwrapValue(row.getCell(COL.ctc_rate).value);
      const hcBudgeted = unwrapValue(row.getCell(COL.hc_budgeted).value);
      const hcRequired = unwrapValue(row.getCell(COL.hc_required).value);
      const hc = hcBudgeted > 0 ? hcBudgeted : hcRequired;

      // Filter: must have positive CTC and positive HC
      if (ctcRate <= 0) continue;
      if (hc <= 0) continue;

      const netRate = unwrapValue(row.getCell(COL.net_rate).value);

      let code = deriveLineCode(position, prefix);
      let suffix = 1;
      while (seenCodes.has(code)) {
        code = `${deriveLineCode(position, prefix).slice(0, 30)}_${suffix++}`;
      }
      seenCodes.add(code);

      rows.push({
        service_line,
        category: 'manning',
        line_code: code,
        label_en: position,
        label_ar: null,
        qty: hc,
        unit_cost: ctcRate,
        ctc_net: netRate > 0 ? netRate : null,
        ctc_relievers: null,
        ctc_ot: null,
        ctc_training: null,
        ctc_insurance: null,
        ctc_medical: null,
      });
      rowsAdded++;
    }
    if (rowsAdded === 0) {
      warnings.push(`${sheetName}: parsed no manning rows — check column mapping or filter rules`);
    }
  }

  // Suggested contract name
  const contract_name = 'TRIO Compound';

  if (rows.length === 0) {
    errors.push({ sheet: '*', row: 0, message: 'No manning rows extracted from any Budget sheet. Check that sheets are named exactly: HK Budget / MEP Budget / LS Budget / Pest Control Budget / Back Office Budget.' });
  }

  return {
    contract_name,
    rows,
    warnings: [
      ...warnings,
      'TRIO v2.1 parser: imports MANNING lines only with CTC Rate as unit_cost. Tools/consumables/transport/IT lines from BOQ sheets are NOT yet parsed — re-export those via flat template if needed.',
    ],
    errors,
    skippedSheets,
  };
}
