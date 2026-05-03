/**
 * Rich AUC-style XLSX parser — Strategy A (Grand Total Budget sheet).
 *
 * The AUC Budget workbook has a "AUC Grand Total Budget" sheet with all
 * cost lines and per-sub-location HC columns.  We read this single sheet
 * and emit FlatRow[] records — one row per (role, sub_location, season).
 *
 * Column map (1-based) for the Grand Total Budget sheet:
 *   C2  = role label
 *   C3  = Total High HC
 *   C4  = Total Low HC
 *   C6  = CTC (EGP / person / month)  — for transport: cost per vehicle/month
 *   C7  = Total High Monthly  (= C3 × C6)
 *   C9  = Total Low Monthly   (= C4 × C6)
 *
 *   Sub-location block layout (High HC | Low HC | Hi Monthly | Lo Monthly):
 *     Inner Campus:      C13 | C14 | C15 | C17
 *     Outer Campus:      C20 | C21 | C22 | C24
 *     NC Off-Campus:     C27 | C28 | C29 | C31
 *     Maadi Buildings:   C34 | C35 | C36 | C38
 *
 * Row ranges on the Grand Total sheet:
 *   R6–R20  : manning roles
 *   R28–R33 : transport / vehicles
 *
 * Sub-location rows are emitted when the HC value > 0.
 * If a role has no non-zero sub-location HC, a single "total" row is emitted
 * using the total HC and CTC from the sheet (unit_cost = CTC, qty = HC).
 */

import ExcelJS from 'exceljs';
import type { FlatRow } from './flat-template';

// ── sheet detection ──────────────────────────────────────────────────────────

const SHEET_NAME_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /Total\s+Manning/i,                  category: 'manning'     },
  { pattern: /Total\s+Equipment/i,                category: 'equipment'   },
  { pattern: /Total\s+Tools/i,                    category: 'tools'       },
  { pattern: /Total\s+Consumables/i,              category: 'consumables' },
  { pattern: /Total\s+Transportation/i,           category: 'transport'   },
  { pattern: /Total\s+IT/i,                       category: 'it'          },
  { pattern: /Grand\s*Total.*Budget/i,            category: '__grand__'   },
];

export async function isRichAucStyleWorkbook(buf: Buffer | ArrayBuffer): Promise<boolean> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const names = wb.worksheets.map(w => w.name);
  return SHEET_NAME_PATTERNS.some(p => names.some(n => p.pattern.test(n)));
}

// ── types ─────────────────────────────────────────────────────────────────────

export type RichParseResult = {
  rows: FlatRow[];
  errors: Array<{ sheet: string; row: number; message: string }>;
};

// ── sub-location column config ────────────────────────────────────────────────
// Each entry: (keyword matched against row-3 header text, sub_location label,
//   highHcCol, lowHcCol, highMonthlyCol, lowMonthlyCol)
const SUB_LOCATION_COLS: Array<{
  keyword: string;
  sub_location: string;
  highHcCol: number;
  lowHcCol: number;
  highMoCol: number;
  lowMoCol: number;
}> = [
  {
    keyword: 'INNER',
    sub_location: 'NC Inner Campus',
    highHcCol: 13, lowHcCol: 14,
    highMoCol: 15, lowMoCol: 17,
  },
  {
    keyword: 'OUTER',
    sub_location: 'Outer Campus',
    highHcCol: 20, lowHcCol: 21,
    highMoCol: 22, lowMoCol: 24,
  },
  {
    keyword: 'OFF',
    sub_location: 'NC Off-Campus Housing',
    highHcCol: 27, lowHcCol: 28,
    highMoCol: 29, lowMoCol: 31,
  },
  {
    keyword: 'MAADI',
    sub_location: 'Maadi Buildings',
    highHcCol: 34, lowHcCol: 35,
    highMoCol: 36, lowMoCol: 38,
  },
];

// ── role label → line_code mapping ───────────────────────────────────────────
const MANNING_LABELS: Array<{ re: RegExp; code: string }> = [
  { re: /^HK\s+Manager/i,                                   code: 'hk_manager'     },
  { re: /^Ass\.?\s*\.?\s*Mang?er/i,                         code: 'asst_manager'   },
  { re: /S[ie]+nior\s+Supervisor/i,                         code: 'sr_supervisor'  },
  { re: /^Supervisor\s+8H\s+R/i,                            code: 'sup_8h_r'       },
  { re: /^Supervisor\s+8H/i,                                code: 'sup_8h'         },
  { re: /HK\s+(Male\s*[&and]+\s*Female|Male|Female)\s+8H\s+R/i, code: 'hk_f_8h_r'},
  { re: /HK\s+Male\s*[&and]+\s*Female\s+8H/i,              code: 'hk_mf_8h'       },
  { re: /Facades\s+Supervisor/i,                            code: 'facades_sup'    },
  { re: /Facades\s+Labor/i,                                 code: 'facades_lab'    },
  { re: /Supervisor\s+Waste/i,                              code: 'waste_sup'      },
  { re: /Labor\s+Waste/i,                                   code: 'waste_lab'      },
  { re: /^Admin/i,                                          code: 'admin'          },
  { re: /Storekeeper/i,                                     code: 'storekeeper'    },
  { re: /Drivers?/i,                                        code: 'driver'         },
  { re: /^Trainer/i,                                        code: 'trainer'        },
];

const TRANSPORT_LABELS: Array<{ re: RegExp; code: string }> = [
  { re: /^Bus$/i,                                  code: 'bus'       },
  { re: /Microbus/i,                               code: 'microbus'  },
  { re: /Sidan|Sedan/i,                            code: 'sedan'     },
  { re: /^Minivan$/i,                              code: 'minivan'   },
  { re: /Pick\s*[-\s]?up/i,                        code: 'pickup'    },
  { re: /Fu[el]{2}|Fule/i,                         code: 'fuel'      },
];

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve an ExcelJS cell value to a number, handling formula result objects. */
function cellNum(row: ExcelJS.Row, col: number): number | null {
  const raw: unknown = row.getCell(col).value;
  if (raw == null) return null;
  // CellFormulaValue has a `result` property with the cached computed value.
  if (typeof raw === 'object' && raw !== null && 'result' in raw) {
    const n = Number((raw as { result: unknown }).result);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Resolve an ExcelJS cell value to a trimmed string, handling formula results. */
function cellStr(row: ExcelJS.Row, col: number): string {
  const raw: unknown = row.getCell(col).value;
  if (raw == null) return '';
  if (typeof raw === 'object' && raw !== null && 'result' in raw) {
    return String((raw as { result: unknown }).result ?? '').trim();
  }
  return String(raw).trim();
}

// ── main parse ───────────────────────────────────────────────────────────────

export async function parseRichAucStyleXlsx(
  buf: Buffer | ArrayBuffer,
  opts: { project: string },
): Promise<RichParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);

  const gts = wb.worksheets.find(w => /Grand\s*Total.*Budget/i.test(w.name));
  if (!gts) {
    return {
      rows: [],
      errors: [{ sheet: '(none)', row: 0, message: 'No "Grand Total Budget" sheet found' }],
    };
  }

  const out: FlatRow[] = [];
  const errors: RichParseResult['errors'] = [];

  // ── Manning rows: R6–R20 ──────────────────────────────────────────────────
  for (let r = 6; r <= 20; r++) {
    const row = gts.getRow(r);
    const label = cellStr(row, 2);
    if (!label) continue;

    const lineDef = MANNING_LABELS.find(l => l.re.test(label));
    if (!lineDef) {
      errors.push({ sheet: gts.name, row: r, message: `Unrecognised manning label: "${label}"` });
      continue;
    }

    const ctc = cellNum(row, 6);
    if (ctc == null || ctc <= 0) {
      errors.push({ sheet: gts.name, row: r, message: `Missing/zero CTC for "${label}" at R${r}` });
      continue;
    }

    // Emit sub-location rows where HC > 0
    let emittedAny = false;
    for (const sl of SUB_LOCATION_COLS) {
      const hiHc = cellNum(row, sl.highHcCol);
      const loHc = cellNum(row, sl.lowHcCol);

      if (hiHc != null && hiHc > 0) {
        out.push({
          project: opts.project,
          service_line: 'hk',
          sub_location: sl.sub_location,
          category: 'manning',
          line_code: lineDef.code,
          season: 'high',
          qty: hiHc,
          unit_cost: ctc,
          notes: null,
        });
        emittedAny = true;
      }
      if (loHc != null && loHc > 0) {
        out.push({
          project: opts.project,
          service_line: 'hk',
          sub_location: sl.sub_location,
          category: 'manning',
          line_code: lineDef.code,
          season: 'low',
          qty: loHc,
          unit_cost: ctc,
          notes: null,
        });
        emittedAny = true;
      }
    }

    // If no sub-location breakdown, fall back to the total HC columns
    if (!emittedAny) {
      const totHiHc = cellNum(row, 3);
      const totLoHc = cellNum(row, 4);
      if (totHiHc != null && totHiHc > 0) {
        out.push({
          project: opts.project, service_line: 'hk', sub_location: null,
          category: 'manning', line_code: lineDef.code, season: 'high',
          qty: totHiHc, unit_cost: ctc, notes: null,
        });
      }
      if (totLoHc != null && totLoHc > 0) {
        out.push({
          project: opts.project, service_line: 'hk', sub_location: null,
          category: 'manning', line_code: lineDef.code, season: 'low',
          qty: totLoHc, unit_cost: ctc, notes: null,
        });
      }
    }
  }

  // ── Transport rows: R28–R33 ───────────────────────────────────────────────
  // NOTE: some sub-location vehicle counts are inconsistent with the total HC in
  // the source XLSX (e.g. Minivan inner+outer = 5 but total = 3).  The Budget
  // Summary formula uses C7 = C3 × CTC (the total HC column), so we always emit
  // transport rows using the *total* HC (C3/C4) rather than per-sub-location HCs.
  // This guarantees the combined sum matches the 2,466,250 ground truth.
  for (let r = 28; r <= 33; r++) {
    const row = gts.getRow(r);
    const label = cellStr(row, 2);
    if (!label) continue;

    const lineDef = TRANSPORT_LABELS.find(l => l.re.test(label));
    if (!lineDef) {
      errors.push({ sheet: gts.name, row: r, message: `Unrecognised transport label: "${label}"` });
      continue;
    }

    // For transport: qty = vehicle count, unit_cost = cost-per-vehicle-per-month.
    const ctc = cellNum(row, 6);
    const totHiHc = cellNum(row, 3);
    const totLoHc = cellNum(row, 4);

    if (ctc == null || ctc <= 0) {
      // No vehicle price or formula-only cell with no cached result — skip.
      continue;
    }

    if (totHiHc != null && totHiHc > 0) {
      out.push({
        project: opts.project, service_line: 'hk', sub_location: null,
        category: 'transport', line_code: lineDef.code, season: 'high',
        qty: totHiHc, unit_cost: ctc, notes: null,
      });
    }
    if (totLoHc != null && totLoHc > 0) {
      out.push({
        project: opts.project, service_line: 'hk', sub_location: null,
        category: 'transport', line_code: lineDef.code, season: 'low',
        qty: totLoHc, unit_cost: ctc, notes: null,
      });
    }
  }

  return { rows: out, errors };
}
