import ExcelJS from 'exceljs';

function unwrap(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && v !== null) {
    const o = v as { result?: unknown; richText?: Array<{ text?: string }> };
    if (Array.isArray(o.richText)) return o.richText.map(t => t.text ?? '').join('').trim();
    if ('result' in o) return unwrap(o.result);
  }
  return String(v);
}

async function dumpSheet(name: string, fromRow = 1, toRow?: number) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:/kareemhady/.claude/FMPLUS/TRIO Budget .xlsx');
  const ws = wb.getWorksheet(name);
  if (!ws) { console.log(`!! sheet not found: ${name}`); return; }
  const last = toRow ?? ws.rowCount;
  console.log(`\n========== ${name} rows ${fromRow}-${last} ==========`);
  for (let r = fromRow; r <= last; r++) {
    const cells: string[] = [];
    for (let c = 1; c <= 13; c++) {
      cells.push(unwrap(ws.getRow(r).getCell(c).value).slice(0, 32));
    }
    if (cells.some(s => s !== '')) {
      console.log(`r${String(r).padStart(3)}: ${cells.map(s => s.padEnd(18).slice(0, 18)).join(' | ')}`);
    }
  }
}

async function main() {
  await dumpSheet('HK Budget', 30, 62);
}

main().catch(e => { console.error(e); process.exit(1); });
