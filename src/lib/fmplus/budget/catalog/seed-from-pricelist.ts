import ExcelJS from 'exceljs';
import { FmplusCatalogItemSchema, type FmplusCatalogItem } from '../schema';
import type { Category, ServiceLine } from '../types';

// Sheet column layout for Emaar Items Pricelist fixture (verified empirically):
// A=row no | B=item name (en) | C=unit | D=null (formula stripped) | E=resolved price
const COL = { name: 2, unit: 3, price: 5 };

/**
 * Heuristic classifier mapping item name → (category, tags).
 * The Emaar source has no category column; we infer from name keywords.
 * Order matters — earlier patterns win. Default fallback is 'tools'.
 */
const CATEGORY_RULES: Array<{ regex: RegExp; category: Category; tags: string[] }> = [
  // PPE
  { regex: /\b(glove|mask|uniform|safety shoe|boots)/i, category: 'ppe',         tags: ['ppe'] },
  // Consumables: bags, paper, soap, chemicals, pesticides, cleaning chemicals
  { regex: /\bgarbage bag/i,                            category: 'consumables', tags: ['bags'] },
  { regex: /\b(toilet paper|tissue|paper roll|auto cut|interfold)/i, category: 'consumables', tags: ['paper'] },
  { regex: /\b(soap|h500|d10|hand soap|dispenser)/i,    category: 'consumables', tags: ['soap'] },
  { regex: /\b(room care|taski|helga|techno|coper|dettol|polish|disinfect|insecticide|shampoo|rgl|tcl|marble)/i,
                                                         category: 'consumables', tags: ['cleaning-chemicals'] },
  { regex: /\b(white cloth|floor cloth|microfiber|sponge)/i, category: 'consumables', tags: ['cloths'] },
  { regex: /\bhebraic\b/i,                              category: 'consumables', tags: ['chemicals'] },
  { regex: /\btablet\b/i,                              category: 'consumables', tags: ['cleaning-chemicals'] },
  // Tools: bins, brooms, mops, squeegees, scrapers, brushes, ashtrays, signs
  { regex: /\b(bin|trash bin|basket|ashtray)/i,         category: 'tools',       tags: ['containers'] },
  { regex: /\b(broom|mop|mob|squeegee|scrapper|scraper|brush|telepole|pad)/i,
                                                         category: 'tools',       tags: ['cleaning-tools'] },
  { regex: /\b(caution board|wet floor)/i,              category: 'tools',       tags: ['signs'] },
  { regex: /\b(bucket|sponge holder|washer sleeve|sleeve)/i, category: 'tools',  tags: ['utility'] },
];

const FALLBACK_CATEGORY: Category = 'tools';

export function classifyItem(nameEn: string): { category: Category; tags: string[] } {
  for (const rule of CATEGORY_RULES) {
    if (rule.regex.test(nameEn)) {
      return { category: rule.category, tags: rule.tags };
    }
  }
  return { category: FALLBACK_CATEGORY, tags: [] };
}

/**
 * Map XLSX unit string → catalog unit enum.
 */
function normalizeUnit(s: string): FmplusCatalogItem['unit'] {
  const u = (s ?? '').toLowerCase().trim();
  if (['kg'].includes(u))                                     return 'kg';
  if (['l', 'ltr', 'liter', 'gallon'].includes(u))            return 'liter';
  if (['m2', 'sqm', 'm²'].includes(u))                        return 'm2';
  if (u.includes('%') || u.includes('rev'))                   return 'pct_revenue';
  if (['mo', 'month', 'monthly', '/mo'].includes(u))          return 'monthly';
  if (['yr', 'annual', '/yr'].includes(u))                    return 'annual';
  // 'each', 'box', 'pack', or anything else → 'each'
  return 'each';
}

function deriveCode(nameEn: string): string {
  return 'cat_' + nameEn.toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 38);
}

export async function parsePricelist(filePath: string): Promise<FmplusCatalogItem[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.getWorksheet('Items Pricelist') ?? wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in pricelist file');

  const rows: FmplusCatalogItem[] = [];
  const seenCodes = new Set<string>();

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = String(row.getCell(COL.name).value ?? '').trim();
    let priceVal: unknown = row.getCell(COL.price).value;
    // Excel formula objects expose either .result or .value
    if (priceVal && typeof priceVal === 'object') {
      const obj = priceVal as Record<string, unknown>;
      if ('result' in obj) priceVal = obj.result;
      else if ('value' in obj) priceVal = obj.value;
    }
    const price = Number(priceVal);
    const unitRaw = String(row.getCell(COL.unit).value ?? '').trim();

    if (!name || !Number.isFinite(price) || price <= 0) continue;

    let code = deriveCode(name);
    let suffix = 1;
    while (seenCodes.has(code)) {
      code = deriveCode(name).slice(0, 35) + '_' + suffix;
      suffix++;
    }
    seenCodes.add(code);

    const cls = classifyItem(name);
    const item = {
      code,
      name_en: name,
      name_ar: undefined,
      unit: normalizeUnit(unitRaw),
      default_price: price,
      service_lines: ['hk'] as ServiceLine[],
      category: cls.category,
      tags: cls.tags,
      is_active: true,
    };
    const parsed = FmplusCatalogItemSchema.parse(item);
    rows.push(parsed);
  }
  return rows;
}

/**
 * Generate a SQL migration body that bulk-inserts catalog rows. Idempotent
 * via `on conflict (code) do update set ...`.
 */
export function buildSeedSql(rows: FmplusCatalogItem[]): string {
  if (rows.length === 0) return '-- no rows';
  const sqlEscape = (s: string) => "'" + s.replace(/'/g, "''") + "'";
  const values = rows.map(r => {
    const services = r.service_lines.length ? r.service_lines.map(s => `'${s}'`).join(',') : '';
    const tags = r.tags.length ? r.tags.map(t => sqlEscape(t)).join(',') : '';
    return `  (${sqlEscape(r.code)}, ${sqlEscape(r.name_en)}, ${r.name_ar ? sqlEscape(r.name_ar) : 'null'}, '${r.unit}', ${r.default_price}, ARRAY[${services}]::text[], '${r.category}', ARRAY[${tags}]::text[])`;
  }).join(',\n');
  return `-- Seed fmplus_catalog from Emaar Uptown Items Pricelist (~76 items).
-- Auto-generated by seed-from-pricelist.ts. Idempotent — safe to re-apply.
insert into public.fmplus_catalog (code, name_en, name_ar, unit, default_price, service_lines, category, tags) values
${values}
on conflict (code) do update set
  name_en = excluded.name_en,
  name_ar = excluded.name_ar,
  unit = excluded.unit,
  default_price = excluded.default_price,
  service_lines = excluded.service_lines,
  category = excluded.category,
  tags = excluded.tags,
  is_active = excluded.is_active;
`;
}
