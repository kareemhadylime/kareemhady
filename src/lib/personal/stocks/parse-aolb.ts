import { XMLParser } from 'fast-xml-parser';

export class AolbParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AolbParseError';
  }
}

export type AolbRawRow = {
  rowIndex: number;
  details: string | null;
  occurredAt: string | null;          // ISO YYYY-MM-DD, null if header/footer
  opType: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balanceAfter: number | null;
  dcFlag: string | null;
};

export type AolbParseResult = {
  openBalance: number | null;
  closeBalance: number | null;
  rows: AolbRawRow[];
  parseWarnings: string[];
};

const SS_NS = 'urn:schemas-microsoft-com:office:spreadsheet';

function toNumber(v: unknown): { value: number; ok: boolean } {
  if (v === null || v === undefined || v === '') return { value: 0, ok: true };
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? { value: n, ok: true } : { value: 0, ok: false };
}

function parseDateDmy(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseBalanceLine(line: string): number | null {
  // 'Open Balance 0.00' or 'Close Balance -2,999,534.49 Debit'
  const m = /-?[\d,]+(?:\.\d+)?/.exec(line);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  const isDebit = /debit/i.test(line);
  if (!Number.isFinite(n)) return null;
  return isDebit ? -Math.abs(n) : n;
}

export function parseAolbXml(xml: string): AolbParseResult {
  if (!xml.includes(SS_NS)) {
    throw new AolbParseError('Not a SpreadsheetML 2003 file (missing namespace).');
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) => name === 'Row' || name === 'Cell' || name === 'Worksheet',
  });
  const doc = parser.parse(xml);
  const wb = doc.Workbook ?? doc['ss:Workbook'];
  if (!wb) throw new AolbParseError('Workbook element not found.');
  const sheets: any[] = wb.Worksheet ?? wb['ss:Worksheet'] ?? [];
  const sheet = sheets.find((s) => (s['@_ss:Name'] ?? s['@_Name']) === 'ag-grid') ?? sheets[0];
  if (!sheet) throw new AolbParseError('No worksheet found.');
  const table = sheet.Table ?? sheet['ss:Table'];
  const rows: any[] = table?.Row ?? [];

  let openBalance: number | null = null;
  let closeBalance: number | null = null;
  const out: AolbRawRow[] = [];
  const parseWarnings: string[] = [];

  rows.forEach((row, rowIndex) => {
    const cells: any[] = row?.Cell ?? [];
    // Materialize a dense 8-col array, honoring ss:Index gaps
    const cols: (string | null)[] = new Array(8).fill(null);
    let cursor = 0;
    for (const cell of cells) {
      const idxAttr = cell['@_ss:Index'] ?? cell['@_Index'];
      if (idxAttr) cursor = parseInt(idxAttr, 10) - 1;
      const data = cell.Data ?? cell['ss:Data'];
      const text = data?.['#text'] ?? data?.['#'] ?? (typeof data === 'string' ? data : null);
      if (cursor < cols.length) cols[cursor] = text ?? null;
      cursor += 1;
    }

    // Normalize empty strings → null so `=== null` checks cover both cases.
    for (let i = 0; i < cols.length; i += 1) {
      if (cols[i] === '') cols[i] = null;
    }

    // Detect open / close balance rows (single text cell starting with "Open Balance" or "Close Balance")
    if (cols[0]) {
      const t = String(cols[0]).trim();
      if (/^open balance/i.test(t)) { openBalance = parseBalanceLine(t); return; }
      if (/^close balance/i.test(t)) { closeBalance = parseBalanceLine(t); return; }
    }

    // Header row?  cols[0] === 'Details' and cols[2] === 'Operation Type'
    if (cols[0] === 'Details' && cols[2] === 'Operation Type') return;

    // Empty row
    if (cols.every((c) => c === null)) return;

    const debit = toNumber(cols[4]);
    const credit = toNumber(cols[5]);
    const balanceAfter = cols[6] === null ? null : toNumber(cols[6]);
    if (!debit.ok) parseWarnings.push(`row ${rowIndex}: junk debit value "${String(cols[4])}"`);
    if (!credit.ok) parseWarnings.push(`row ${rowIndex}: junk credit value "${String(cols[5])}"`);
    if (balanceAfter && !balanceAfter.ok) parseWarnings.push(`row ${rowIndex}: junk balance value "${String(cols[6])}"`);

    out.push({
      rowIndex,
      details: cols[0] ?? null,
      occurredAt: parseDateDmy(cols[1] ?? null),
      opType: cols[2] ?? null,
      description: cols[3] ?? null,
      debit: debit.value,
      credit: credit.value,
      balanceAfter: balanceAfter === null ? null : balanceAfter.value,
      dcFlag: cols[7] ?? null,
    });
  });

  return { openBalance, closeBalance, rows: out, parseWarnings };
}
