import ExcelJS from 'exceljs';

export type ParserId =
  | 'rich-auc-style'
  | 'trio-style'
  | 'city-gate-multi-year'
  | 'emaar-zone-style'
  | 'flat-template'
  | 'unknown';

export interface DetectResult {
  parser: ParserId;
  reason: string;
  sheetNames: string[];
}

/**
 * Sniff a workbook's sheet structure and pick the right parser.
 * Detection rules (first match wins):
 *   1. City Gate: has both Y1 and Y2 sheets (pattern: `-Y1` or `-Y2` suffix) + `FM Fees Summary`
 *   2. Emaar zone: has `Items Pricelist` sheet + `Per Zone` sheet
 *   3. TRIO: has a sheet with `BOQ` in the name or `Back Office` sheet
 *   4. AUC: has both a Manning sheet and a Consumables sheet
 *   5. Flat template: first sheet has `project`, `service_line`, `line_code` headers in row 1
 */
export async function detectParser(filePath: string): Promise<DetectResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const names = wb.worksheets.map(s => s.name);
  const lower = names.map(n => n.toLowerCase());

  // 1. City Gate: Y1/Y2 pattern (e.g., "Budget-Y1", "MEP Budget-Y2") + FM Fees Summary
  const hasY1Suffix = lower.some(n => /-y1\s*$/.test(n));
  const hasY2Suffix = lower.some(n => /-y2\s*$/.test(n));
  const hasFmFees = lower.some(n => n.includes('fm fees'));
  if (hasY1Suffix && hasY2Suffix && hasFmFees) {
    return { parser: 'city-gate-multi-year', reason: 'Y1/Y2 multi-year sheets + FM Fees Summary', sheetNames: names };
  }

  // 2. Emaar zone
  if (lower.includes('items pricelist') && lower.some(n => n.includes('zone'))) {
    return { parser: 'emaar-zone-style', reason: 'Items Pricelist + Per Zone layout', sheetNames: names };
  }

  // 3. TRIO: BOQ sheet or Back Office sheet
  if (lower.some(n => n.includes('boq')) || lower.some(n => n.includes('back office'))) {
    return { parser: 'trio-style', reason: 'TRIO multi-service layout (BOQ or Back Office)', sheetNames: names };
  }

  // 4. AUC: per-category detail sheets (e.g. "Manning", "Consumables", etc.)
  const hasManning = lower.some(n => n.includes('manning'));
  const hasConsumables = lower.some(n => n.includes('consumables'));
  if (hasManning && hasConsumables) {
    return { parser: 'rich-auc-style', reason: 'Manning + Consumables detail sheets', sheetNames: names };
  }

  // 5. Flat template — check first sheet's row 1 headers
  const firstSheet = wb.worksheets[0];
  if (firstSheet) {
    const firstRow = firstSheet.getRow(1);
    const headers: string[] = [];
    for (let c = 1; c <= 20; c++) {
      const v = firstRow.getCell(c).value;
      if (v != null) headers.push(String(v).toLowerCase().trim());
    }
    const headerSet = new Set(headers);
    if (headerSet.has('project') && headerSet.has('service_line') && headerSet.has('line_code')) {
      return { parser: 'flat-template', reason: 'flat template column headers detected on first sheet', sheetNames: names };
    }
  }

  return { parser: 'unknown', reason: 'no parser matched — sheet structure unrecognized', sheetNames: names };
}
