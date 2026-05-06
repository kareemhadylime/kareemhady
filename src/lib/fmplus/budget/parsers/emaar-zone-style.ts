import ExcelJS from 'exceljs';
import type { ServiceLine, Category } from '../types';

export interface ParsedEmaarRow {
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

export interface ParseEmaarResult {
  contract_name: string;
  rows: ParsedEmaarRow[];
  warnings: string[];
  errors: Array<{ sheet: string; row: number; message: string }>;
  /** List of zones found in Per Zone sheet — caller should set on contract.zones */
  zones: string[];
  skippedSheets: string[];
}

const COL = {
  item: 2,
  ctc_total: 3,
  hc: 4,
  net: 5,
  relievers: 6,
  ot: 7,
  training: 8,
  insurance: 9,
  medical: 10,
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

const SECTION_LABELS = new Set([
  'basic scope', 'sales center', 'subtotal', 'category',
]);

/** When col2 matches any of these the data section is over — stop iterating. */
const STOP_LABELS = new Set(['total', 'total ']);

export async function parseEmaarZoneStyle(filePath: string): Promise<ParseEmaarResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const rows: ParsedEmaarRow[] = [];
  const warnings: string[] = [];
  const errors: Array<{ sheet: string; row: number; message: string }> = [];
  const skippedSheets: string[] = [];
  const seenCodes = new Set<string>();

  // 1. Manpower CTC sheet — manning lines with full CTC breakdown
  const ctcSheet = wb.getWorksheet('Manpower CTC');
  if (!ctcSheet) {
    errors.push({ sheet: 'Manpower CTC', row: 0, message: 'Manpower CTC sheet not found' });
  } else {
    for (let r = 5; r <= ctcSheet.rowCount; r++) {
      const row = ctcSheet.getRow(r);
      const item = unwrapString(row.getCell(COL.item).value);
      if (!item) continue;
      const lower = item.toLowerCase();
      // "Total" row marks end of data section — stop processing
      if (STOP_LABELS.has(lower)) break;
      if (SECTION_LABELS.has(lower)) continue;

      const ctc = unwrapValue(row.getCell(COL.ctc_total).value);
      const hc = unwrapValue(row.getCell(COL.hc).value);
      if (ctc <= 0 || hc <= 0) continue;

      const net = unwrapValue(row.getCell(COL.net).value);
      const relievers = unwrapValue(row.getCell(COL.relievers).value);
      const ot = unwrapValue(row.getCell(COL.ot).value);
      const training = unwrapValue(row.getCell(COL.training).value);
      const insurance = unwrapValue(row.getCell(COL.insurance).value);
      const medical = unwrapValue(row.getCell(COL.medical).value);

      let code = deriveLineCode(item, 'hk_mng');
      let suffix = 1;
      while (seenCodes.has(code)) {
        code = `${deriveLineCode(item, 'hk_mng').slice(0, 28)}_${suffix++}`;
      }
      seenCodes.add(code);

      rows.push({
        service_line: 'hk',
        category: 'manning',
        line_code: code,
        label_en: item,
        label_ar: null,
        qty: hc,
        unit_cost: ctc,
        ctc_net: net > 0 ? net : null,
        ctc_relievers: relievers > 0 ? relievers : null,
        ctc_ot: ot > 0 ? ot : null,
        ctc_training: training > 0 ? training : null,
        ctc_insurance: insurance > 0 ? insurance : null,
        ctc_medical: medical > 0 ? medical : null,
      });
    }
  }

  // 2. Per Zone sheet — extract zone names for contract metadata
  const zones: string[] = [];
  const zoneSheet = wb.getWorksheet('Per Zone');
  if (zoneSheet) {
    for (let r = 4; r <= zoneSheet.rowCount; r++) {
      const row = zoneSheet.getRow(r);
      const num = unwrapValue(row.getCell(1).value);
      const name = unwrapString(row.getCell(2).value);
      if (num > 0 && name && name.toLowerCase() !== 'total') {
        zones.push(name);
      }
    }
  }

  // 3. Track skipped sheets for transparency
  for (const sh of wb.worksheets) {
    if (sh.name === 'Manpower CTC' || sh.name === 'Per Zone') continue;
    if (/budget|boq|cost|tools|cons|maning|equip|item|pricelist|transport|over|head|facad|paid|unit/i.test(sh.name)) {
      skippedSheets.push(sh.name);
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ sheet: 'Manpower CTC', row: 0, message: 'No manning rows extracted. Check column layout.' });
  }

  return {
    contract_name: 'Emaar Uptown',
    rows,
    warnings: [
      ...(zones.length > 0 ? [`Detected ${zones.length} zone${zones.length === 1 ? '' : 's'}: ${zones.join(', ')}. After import, edit the contract metadata to record these zones.`] : []),
      'Emaar v2.1 parser: imports MANNING lines from Manpower CTC sheet with full 6-component CTC breakdown. Tools/Equipment/Consumables/Transportation/IT lines are NOT yet parsed — re-export those via flat template if needed.',
    ],
    errors,
    zones,
    skippedSheets,
  };
}
