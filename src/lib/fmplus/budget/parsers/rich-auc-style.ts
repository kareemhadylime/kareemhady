import ExcelJS from 'exceljs';
import type { ServiceLine, Category } from '../types';

export interface ParsedBudgetRow {
  service_line: ServiceLine;
  category: Category;
  line_code: string;
  label_en: string;
  label_ar: string | null;
  qty: number;
  unit_cost: number;
  ctc_net?: number | null;
  ctc_relievers?: number | null;
  ctc_ot?: number | null;
  ctc_training?: number | null;
  ctc_insurance?: number | null;
  ctc_medical?: number | null;
}

export interface ParseAucResult {
  /** Suggested contract name from the workbook (e.g. "AUC"). User can override at commit. */
  contract_name: string;
  /** Single Y1 worth of budget lines, all under HK service. */
  rows: ParsedBudgetRow[];
  /** Validation: parsed totals per category vs Budget Items Summary sheet. */
  validation: {
    summary: Record<string, {
      parsed_low: number;
      parsed_high: number;
      expected_low: number | null;
      expected_high: number | null;
      drift_pct: number | null;
    }>;
    warnings: string[];
  };
  errors: Array<{ sheet: string; row: number; message: string }>;
}

const SHEET_TO_CATEGORY: Record<string, Category> = {
  'AUC Total Manning':            'manning',
  'AUC Total Equipment':          'tools',
  'AUC Total Tools':              'tools',
  'AUC Total Consumables':        'consumables',
  'AUC Total Transportation':     'transport',
  'AUC Total IT & Communication': 'it',
};

const COL = { name: 2, qty_hi: 3, qty_lo: 4, deprec: 5, price: 6, mo_hi: 7, mo_lo: 9 } as const;

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
  if (typeof v === 'object' && v !== null) {
    const obj = v as { result?: unknown; value?: unknown; text?: unknown; richText?: unknown };
    if ('result' in obj) return unwrapString(obj.result);
    if ('value' in obj) return unwrapString(obj.value);
    if ('text' in obj) return String(obj.text ?? '').trim();
    // richText array (ExcelJS RichTextValue)
    if ('richText' in obj && Array.isArray((obj as { richText: unknown[] }).richText)) {
      return (obj as { richText: Array<{ text?: string }> }).richText
        .map(rt => rt.text ?? '')
        .join('')
        .trim();
    }
  }
  return String(v).trim();
}

function deriveLineCode(name: string, prefix: string): string {
  return prefix + '_' + name.toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 32);
}

export async function parseAucStyle(filePath: string): Promise<ParseAucResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const rows: ParsedBudgetRow[] = [];
  const errors: Array<{ sheet: string; row: number; message: string }> = [];
  const warnings: string[] = [];
  const seenCodes = new Set<string>();
  const parsedTotals: Record<string, { low: number; high: number }> = {};

  for (const sheetName of Object.keys(SHEET_TO_CATEGORY)) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) {
      warnings.push(`Sheet "${sheetName}" not found — skipped`);
      continue;
    }
    const category = SHEET_TO_CATEGORY[sheetName];

    if (category === 'manning') {
      // Manning sheet: aggregate total HC from col 2, CTC not in source
      let totalHc = 0;
      for (let r = 5; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const name = unwrapString(row.getCell(1).value);
        if (!name || /total|grand/i.test(name)) continue;
        const qty = unwrapValue(row.getCell(2).value);
        if (qty === 0) continue;

        let code = deriveLineCode(name, 'hk_mng');
        let suffix = 1;
        while (seenCodes.has(code)) {
          code = `${deriveLineCode(name, 'hk_mng').slice(0, 30)}_${suffix++}`;
        }
        seenCodes.add(code);

        rows.push({
          service_line: 'hk',
          category: 'manning',
          line_code: code,
          label_en: name,
          label_ar: null,
          qty,
          unit_cost: 0, // CTC not in source — user fills via Editor expand panel
        });
        totalHc += qty;
      }
      if (totalHc === 0) {
        warnings.push('Manning sheet had 0 total headcount — check the source workbook');
      }
      // Manning doesn't contribute to parsedTotals (unit_cost=0, no monthly figures)
      continue;
    }

    // Non-manning sheets: simpler row structure
    let lowSum = 0;
    let highSum = 0;

    const prefix = 'hk_' + (
      sheetName.toLowerCase().includes('equip') ? 'eq' :
      sheetName.toLowerCase().includes('tool')  ? 'tl' :
      sheetName.toLowerCase().includes('cons')  ? 'cn' :
      sheetName.toLowerCase().includes('trans') ? 'tr' :
      sheetName.toLowerCase().includes('it')    ? 'it' : 'misc'
    );

    for (let r = 6; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = unwrapString(row.getCell(COL.name).value);
      if (!name || /total|grand|subtotal/i.test(name)) continue;

      const qtyHi = unwrapValue(row.getCell(COL.qty_hi).value);
      const qtyLo = unwrapValue(row.getCell(COL.qty_lo).value);
      const deprecRaw = unwrapValue(row.getCell(COL.deprec).value);
      const deprec = Math.max(deprecRaw, 1);
      const price = unwrapValue(row.getCell(COL.price).value);
      const monthlyHi = unwrapValue(row.getCell(COL.mo_hi).value);
      const monthlyLo = unwrapValue(row.getCell(COL.mo_lo).value);

      if (qtyHi === 0 && qtyLo === 0) continue;
      const qty = Math.max(qtyHi, qtyLo);

      const rawPriceCell = row.getCell(COL.price).value;
      const priceIsBlank = rawPriceCell === null || rawPriceCell === undefined;
      if (priceIsBlank) {
        // IT sheet (and some consumable rows) leave price blank in the source workbook.
        // Emit the row with unit_cost=0 so the user can fill it via the Editor.
        warnings.push(`${sheetName} R${r} "${name}": price is blank — unit_cost=0, fill via Editor`);
      }

      const effectiveUnitCost = price / deprec;

      let code = deriveLineCode(name, prefix);
      let suffix = 1;
      while (seenCodes.has(code)) {
        code = `${deriveLineCode(name, prefix).slice(0, 30)}_${suffix++}`;
      }
      seenCodes.add(code);

      rows.push({
        service_line: 'hk',
        category,
        line_code: code,
        label_en: name,
        label_ar: null,
        qty,
        unit_cost: Math.round(effectiveUnitCost * 100) / 100,
      });

      lowSum += monthlyLo;
      highSum += monthlyHi;
    }

    const existing = parsedTotals[category];
    parsedTotals[category] = existing
      ? { low: existing.low + lowSum, high: existing.high + highSum }
      : { low: lowSum, high: highSum };
  }

  // Validate against Budget Items Summary sheet
  const summary: Record<string, {
    parsed_low: number;
    parsed_high: number;
    expected_low: number | null;
    expected_high: number | null;
    drift_pct: number | null;
  }> = {};

  const summarySheet = wb.getWorksheet('Budget Items Summary');
  const expectedByLabel = new Map<string, { low: number; high: number }>();
  if (summarySheet) {
    for (let r = 5; r <= summarySheet.rowCount; r++) {
      const row = summarySheet.getRow(r);
      const label = unwrapString(row.getCell(2).value).toLowerCase();
      const low = unwrapValue(row.getCell(3).value);
      const high = unwrapValue(row.getCell(4).value);
      if (label) expectedByLabel.set(label, { low, high });
    }
  }

  function expectedKey(cat: Category): string | null {
    if (cat === 'manning')     return 'manpower';
    if (cat === 'tools')       return 'tools';
    if (cat === 'consumables') return 'consumables';
    if (cat === 'transport')   return 'transportation';
    if (cat === 'it')          return null; // not always in summary
    return null;
  }

  for (const [cat, totals] of Object.entries(parsedTotals)) {
    const ek = expectedKey(cat as Category);
    let expected_low: number | null = null;
    let expected_high: number | null = null;
    if (ek) {
      for (const [k, v] of expectedByLabel) {
        if (k.includes(ek)) { expected_low = v.low; expected_high = v.high; break; }
      }
    }
    const drift_pct = expected_high && totals.high
      ? Math.abs((totals.high - expected_high) / expected_high)
      : null;

    summary[cat] = {
      parsed_low: totals.low,
      parsed_high: totals.high,
      expected_low,
      expected_high,
      drift_pct,
    };

    if (drift_pct != null && drift_pct > 0.05) {
      warnings.push(
        `${cat}: parsed total ${(totals.high / 1_000_000).toFixed(2)}M differs from summary by ` +
        `${(drift_pct * 100).toFixed(1)}% — review`
      );
    }
  }

  return {
    contract_name: 'AUC',
    rows,
    validation: { summary, warnings },
    errors,
  };
}
