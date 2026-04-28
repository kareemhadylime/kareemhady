import 'server-only';
import ExcelJS from 'exceljs';
import { listCategories, listUoms } from './catalog';

// Excel Item-Master template generator + parser. Q7 V1 scope:
// Item Master only. GRN/Counts via Excel deferred to V2.

export const ITEM_TEMPLATE_COLUMNS = [
  { key: 'sku', header: 'SKU *', width: 18, example: 'CON-TR-FINE12' },
  { key: 'name_en', header: 'Name (EN) *', width: 28, example: 'Fine 12-roll mega' },
  { key: 'name_ar', header: 'Name (AR) *', width: 28, example: 'فاين ١٢ رولة ميجا' },
  { key: 'category_code', header: 'Category code *', width: 18, example: 'consumables' },
  { key: 'uom', header: 'UoM *', width: 10, example: 'pack' },
  { key: 'brand', header: 'Brand', width: 16, example: 'Fine' },
  { key: 'barcode', header: 'Barcode', width: 16, example: '6224000123456' },
  { key: 'min_qty', header: 'Min qty', width: 10, example: 6 },
  { key: 'max_qty', header: 'Max qty', width: 10, example: 30 },
  { key: 'reorder_qty', header: 'Reorder qty', width: 12, example: 12 },
  { key: 'default_cost_egp', header: 'Cost (EGP)', width: 12, example: 280 },
  { key: 'currency', header: 'Currency', width: 10, example: 'EGP' },
  { key: 'batch_tracked', header: 'Batch tracked (Y/N)', width: 18, example: 'N' },
  { key: 'expiry_tracked', header: 'Expiry tracked (Y/N)', width: 18, example: 'N' },
  { key: 'owner_billable', header: 'Owner billable (Y/N)', width: 18, example: 'N' },
  { key: 'is_asset', header: 'Asset (Y/N)', width: 12, example: 'N' },
  { key: 'amazon_eg_url', header: 'Amazon EG URL', width: 30, example: 'https://www.amazon.eg/dp/B0...' },
  { key: 'description', header: 'Description', width: 30, example: '' },
] as const;

export async function generateItemTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Beit Hady Inventory';
  wb.created = new Date();

  // Sheet 1: Items (the import target)
  const sheet = wb.addWorksheet('Items', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheet.columns = ITEM_TEMPLATE_COLUMNS.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  // Header style
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2D4A' } }; // Beit Hady navy
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  sheet.getRow(1).height = 22;

  // Example row (row 2) — italic + lighter to signal it's a sample
  const exampleRowValues: Record<string, unknown> = {};
  for (const col of ITEM_TEMPLATE_COLUMNS) exampleRowValues[col.key] = col.example;
  const exampleRow = sheet.addRow(exampleRowValues);
  exampleRow.eachCell(cell => {
    cell.font = { italic: true, color: { argb: 'FF94A3B8' } };
  });

  // Sheet 2: Categories — reference for Category code column
  const cats = await listCategories();
  const catSheet = wb.addWorksheet('Categories (reference)');
  catSheet.columns = [
    { header: 'Code', key: 'code', width: 18 },
    { header: 'Name (EN)', key: 'name_en', width: 24 },
    { header: 'Name (AR)', key: 'name_ar', width: 24 },
  ];
  catSheet.getRow(1).font = { bold: true };
  for (const c of cats) catSheet.addRow(c);

  // Sheet 3: UoMs — reference for UoM column
  const uoms = await listUoms();
  const uomSheet = wb.addWorksheet('UoMs (reference)');
  uomSheet.columns = [
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Name (EN)', key: 'name_en', width: 16 },
    { header: 'Name (AR)', key: 'name_ar', width: 16 },
    { header: 'Measure', key: 'measure_kind', width: 12 },
  ];
  uomSheet.getRow(1).font = { bold: true };
  for (const u of uoms) uomSheet.addRow(u);

  // Sheet 4: Instructions
  const instr = wb.addWorksheet('Instructions');
  instr.columns = [{ header: 'How to use this template', key: 'note', width: 100 }];
  instr.getRow(1).font = { bold: true, size: 14 };
  const lines = [
    '1. Fill in your items starting at row 3 (row 2 is an example you can delete).',
    '2. Required columns are marked with *. Empty required cells will be flagged as errors.',
    '3. SKU must be unique across all items. The importer will reject duplicates.',
    '4. Category code must match a code in the "Categories (reference)" sheet.',
    '5. UoM must match a code in the "UoMs (reference)" sheet.',
    '6. Boolean columns (batch tracked / expiry tracked / owner billable / asset): use Y or N (or yes/no, true/false).',
    '7. Currency: EGP or USD only (V1).',
    '8. Cost numbers: digits only, no commas or currency symbols.',
    '9. Save the file (.xlsx), then upload it via the "Import from Excel" button on the Items page.',
    '10. The importer will show a preview screen with valid/invalid/new/updated counts before committing anything.',
  ];
  for (const l of lines) instr.addRow({ note: l });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export type ParsedItemRow = {
  rowNum: number;          // 1-indexed Excel row
  raw: Record<string, unknown>;
  parsed?: {
    sku: string;
    name_en: string;
    name_ar: string;
    category_code: string;
    uom: string;
    brand: string | null;
    barcode: string | null;
    min_qty: number;
    max_qty: number | null;
    reorder_qty: number | null;
    default_cost_egp: number;
    currency: 'EGP' | 'USD';
    batch_tracked: boolean;
    expiry_tracked: boolean;
    owner_billable: boolean;
    is_asset: boolean;
    amazon_eg_url: string | null;
    description: string | null;
  };
  errors: string[];
};

function parseBool(v: unknown): boolean {
  if (v === true || v === false) return v;
  if (typeof v === 'number') return v !== 0;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

function parseNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  return n;
}

export async function parseItemTemplate(
  buf: ArrayBuffer | Buffer,
): Promise<{ rows: ParsedItemRow[]; valid: number; invalid: number }> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS expects an ArrayBuffer-like; wrap Node Buffer if needed.
  const ab = Buffer.isBuffer(buf)
    ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    : buf;
  await wb.xlsx.load(ab as ArrayBuffer);
  const sheet = wb.getWorksheet('Items') || wb.worksheets[0];
  if (!sheet) {
    return { rows: [], valid: 0, invalid: 0 };
  }

  const cats = await listCategories();
  const uoms = await listUoms();
  const catCodes = new Set(cats.map(c => c.code));
  const uomCodes = new Set(uoms.map(u => u.code));

  const headerCells = sheet.getRow(1).values as Array<unknown>;
  // ExcelJS row.values is 1-indexed and includes a leading undefined
  const colMap = new Map<string, number>();
  for (let i = 1; i < headerCells.length; i++) {
    const h = String(headerCells[i] || '').trim();
    if (!h) continue;
    // Match by stripping " *" and lowercasing
    for (const c of ITEM_TEMPLATE_COLUMNS) {
      if (h === c.header || h.replace(/\s*\*$/, '').trim() === c.header.replace(/\s*\*$/, '').trim()) {
        colMap.set(c.key, i);
      }
    }
  }

  const out: ParsedItemRow[] = [];
  const seenSkus = new Set<string>();

  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const raw: Record<string, unknown> = {};
    for (const col of ITEM_TEMPLATE_COLUMNS) {
      const colIdx = colMap.get(col.key);
      if (colIdx) raw[col.key] = row.getCell(colIdx).value;
    }

    // Skip the example row (heuristic: italic SKU starting with 'CON-TR-FINE12')
    if (rowNum === 2 && String(raw.sku || '') === 'CON-TR-FINE12') return;

    const errors: string[] = [];

    const sku = raw.sku ? String(raw.sku).trim() : '';
    if (!sku) errors.push('SKU is required');
    else if (seenSkus.has(sku)) errors.push(`Duplicate SKU within file: ${sku}`);
    else seenSkus.add(sku);

    const name_en = raw.name_en ? String(raw.name_en).trim() : '';
    if (!name_en) errors.push('Name (EN) is required');
    const name_ar = raw.name_ar ? String(raw.name_ar).trim() : '';
    if (!name_ar) errors.push('Name (AR) is required');

    const category_code = raw.category_code ? String(raw.category_code).trim() : '';
    if (!category_code) errors.push('Category code is required');
    else if (!catCodes.has(category_code)) errors.push(`Unknown category: ${category_code}`);

    const uom = raw.uom ? String(raw.uom).trim() : '';
    if (!uom) errors.push('UoM is required');
    else if (!uomCodes.has(uom)) errors.push(`Unknown UoM: ${uom}`);

    const default_cost_egp = parseNumOrNull(raw.default_cost_egp) ?? 0;
    if (default_cost_egp < 0) errors.push('Cost cannot be negative');

    const currency = String(raw.currency || 'EGP').trim().toUpperCase();
    if (currency !== 'EGP' && currency !== 'USD') errors.push(`Currency must be EGP or USD (got ${currency})`);

    const min_qty = parseNumOrNull(raw.min_qty) ?? 0;
    const max_qty = parseNumOrNull(raw.max_qty);
    const reorder_qty = parseNumOrNull(raw.reorder_qty);
    if (min_qty < 0) errors.push('Min qty cannot be negative');
    if (max_qty != null && max_qty < min_qty) errors.push('Max qty must be >= Min qty');

    const parsed = errors.length === 0
      ? {
          sku,
          name_en,
          name_ar,
          category_code,
          uom,
          brand: raw.brand ? String(raw.brand).trim() : null,
          barcode: raw.barcode ? String(raw.barcode).trim() : null,
          min_qty,
          max_qty,
          reorder_qty,
          default_cost_egp,
          currency: currency as 'EGP' | 'USD',
          batch_tracked: parseBool(raw.batch_tracked),
          expiry_tracked: parseBool(raw.expiry_tracked),
          owner_billable: parseBool(raw.owner_billable),
          is_asset: parseBool(raw.is_asset),
          amazon_eg_url: raw.amazon_eg_url ? String(raw.amazon_eg_url).trim() : null,
          description: raw.description ? String(raw.description).trim() : null,
        }
      : undefined;

    out.push({ rowNum, raw, parsed, errors });
  });

  const valid = out.filter(r => r.errors.length === 0).length;
  return { rows: out, valid, invalid: out.length - valid };
}
