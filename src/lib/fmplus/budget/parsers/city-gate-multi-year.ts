import ExcelJS from 'exceljs';
import type { ServiceLine, Category } from '../types';

export interface ParsedCityGateRow {
  service_line: ServiceLine;
  category: Category;
  year_index: number;
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

export interface ParseCityGateResult {
  contract_name: string;
  rows: ParsedCityGateRow[];
  warnings: string[];
  errors: Array<{ sheet: string; row: number; message: string }>;
  skippedSheets: string[];
}

interface SheetMapping {
  service_line: ServiceLine;
  year_index: number;
}

const SHEET_MAP: Record<string, SheetMapping> = {
  'MEP Budget-Y1':    { service_line: 'mep',       year_index: 1 },
  'MEP Budget-Y2':    { service_line: 'mep',       year_index: 2 },
  'Landscape Y1':     { service_line: 'landscape', year_index: 1 },
  'Landscape Y2':     { service_line: 'landscape', year_index: 2 },
  'Security Y1':      { service_line: 'security',  year_index: 1 },
  'Security Y2':      { service_line: 'security',  year_index: 2 },
  'Pest Control Y-1': { service_line: 'pest_ctrl', year_index: 1 },
  'Pest Control Y-2': { service_line: 'pest_ctrl', year_index: 2 },
};

/** Labels that identify non-data rows (section headers, totals, etc.) — exact or prefix match. */
const SKIP_LABELS = new Set([
  'manpower',
  'public',
  'private',
  'category',
  'subtotal',
  'total',
  'section',
  'direct costs',
  'direct costs - as per',
  'indirect costs',
  'position',
  'no.',
]);

const PREFIX_BY_SERVICE: Record<ServiceLine, string> = {
  hk:          'hk',
  mep:         'mep',
  landscape:   'ls',
  security:    'sec',
  pest_ctrl:   'pest',
  waste_mgmt:  'waste',
  back_office: 'bo',
};

/**
 * Column indices (1-based) per the verified fixture layout.
 * Col 1 = line number, Col 2 = position/role, Col 4 = Sheet HC, Col 5 = Budget HC, Col 6 = CTC.
 * (The spec's COL_NUM=2 / COL_POSITION=3 reflected a 0-based offset; the actual file is 1-based.)
 */
const COL = {
  num:       1,  // # / line number
  position:  2,  // Position / role name
  hc_sheet:  4,  // Sheet HC (Required)
  hc_budget: 5,  // Budget HC (preferred)
  ctc:       6,  // CTC / head cost (EGP/month) = unit_cost
} as const;

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

function isSkipLabel(position: string): boolean {
  const lower = position.toLowerCase();
  if (SKIP_LABELS.has(lower)) return true;
  for (const skip of SKIP_LABELS) {
    if (lower.startsWith(skip)) return true;
  }
  return false;
}

/**
 * Parse a City Gate multi-year budget XLSX.
 *
 * Extracts manning lines (position + HC + CTC) from the 8 service×year sheets
 * listed in SHEET_MAP. Each parsed row carries a year_index (1 or 2) so the
 * import action can route them to the correct budget_year row.
 *
 * Skipped sheets (HK & Waste, Mobilization, Transportation, FM Fees Summary,
 * and miscellaneous tabs) are tracked in `skippedSheets` and a summary warning
 * is always appended to `warnings`.
 */
export async function parseCityGateMultiYear(filePath: string): Promise<ParseCityGateResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const rows: ParsedCityGateRow[] = [];
  const warnings: string[] = [];
  const errors: Array<{ sheet: string; row: number; message: string }> = [];
  const skippedSheets: string[] = [];

  // Codes must be globally unique across all (service_line, year_index) combinations
  // so we embed year in the prefix — seenCodes tracks the final resolved code.
  const seenCodes = new Set<string>();

  for (const sheet of wb.worksheets) {
    const mapping = SHEET_MAP[sheet.name];
    if (!mapping) {
      // Track sheets that look like budget data we're intentionally not parsing
      if (/budget|y[12]|mob|transport|hk|waste|fees|summary/i.test(sheet.name)) {
        skippedSheets.push(sheet.name);
      }
      continue;
    }

    const { service_line, year_index } = mapping;
    // Embed year in prefix so identical roles across years get distinct codes
    const prefix = `${PREFIX_BY_SERVICE[service_line]}_y${year_index}_mng`;

    let rowsAdded = 0;
    for (let r = 5; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const position = unwrapString(row.getCell(COL.position).value);
      if (!position) continue;
      if (isSkipLabel(position)) continue;

      const ctc = unwrapValue(row.getCell(COL.ctc).value);
      const hcSheet = unwrapValue(row.getCell(COL.hc_sheet).value);
      const hcBudget = unwrapValue(row.getCell(COL.hc_budget).value);

      // Manning rows must have a non-zero Sheet HC (col 4). This distinguishes
      // direct personnel rows from indirect cost items (tools, consumables, etc.)
      // which reuse the same column layout but have no Sheet HC value.
      if (hcSheet <= 0) continue;

      // Prefer Budget HC; fall back to Sheet HC
      const hc = hcBudget > 0 ? hcBudget : hcSheet;

      // Validity gate: must have both positive CTC and positive resolved HC
      if (ctc <= 0 || hc <= 0) continue;

      // Derive a unique line_code
      let code = deriveLineCode(position, prefix);
      let suffix = 1;
      while (seenCodes.has(code)) {
        code = `${deriveLineCode(position, prefix).slice(0, 28)}_${suffix++}`;
      }
      seenCodes.add(code);

      rows.push({
        service_line,
        category: 'manning',
        year_index,
        line_code: code,
        label_en: position,
        label_ar: null,
        qty: hc,
        unit_cost: ctc,
        // City Gate layout doesn't expose net/reliever/OT breakdown in these sheets
        ctc_net:        null,
        ctc_relievers:  null,
        ctc_ot:         null,
        ctc_training:   null,
        ctc_insurance:  null,
        ctc_medical:    null,
      });
      rowsAdded++;
    }

    if (rowsAdded === 0) {
      warnings.push(`${sheet.name}: parsed no manning rows — check column layout or filter rules`);
    }
  }

  // Always append the deferred-features disclaimer
  warnings.push(
    'City Gate v2.1 parser: imports MANNING lines per service per year. ' +
    'HK & Waste Management combined sheet, Mobilization Budget, Transportation, ' +
    'and FM Fees Summary are NOT parsed — re-export those via flat template if needed.',
  );

  if (rows.length === 0) {
    errors.push({
      sheet: '*',
      row: 0,
      message:
        'No manning rows extracted. Check that sheets are named exactly: ' +
        'MEP Budget-Y1/Y2, Landscape Y1/Y2, Security Y1/Y2, Pest Control Y-1/Y-2.',
    });
  }

  return {
    contract_name: 'City Gate',
    rows,
    warnings,
    errors,
    skippedSheets,
  };
}
