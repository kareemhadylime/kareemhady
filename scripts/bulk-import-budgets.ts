/**
 * One-shot bulk import: parse all 4 FMPLUS budget XLSX files via the v2 parsers
 * and emit JSON ready for Supabase insert. Run via:
 *   npx tsx scripts/bulk-import-budgets.ts > /tmp/budget-import.json
 *
 * Output: { contracts: [{name, project_id, year_tracking, services, years: [{year_index, lines}]}, ...] }
 */
import { parseAucStyle } from '../src/lib/fmplus/budget/parsers/rich-auc-style.js';
import { parseTrioStyle } from '../src/lib/fmplus/budget/parsers/trio-style.js';
import { parseCityGateMultiYear } from '../src/lib/fmplus/budget/parsers/city-gate-multi-year.js';
import { parseEmaarZoneStyle } from '../src/lib/fmplus/budget/parsers/emaar-zone-style.js';

interface OutputContract {
  name: string;
  project_id: number;
  year_tracking: 'contract' | 'fiscal';
  start_date: string;
  end_date: string;
  contract_value: number;
  customer: string;
  zones: string[];
  services: string[];
  years: Array<{
    year_index: number;
    lines: Array<{
      service_line: string;
      category: string;
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
    }>;
  }>;
}

const FMPLUS = 'C:/kareemhady/.claude/FMPLUS';
const TODAY = '2026-05-05';
const PLUS_1_YEAR = '2027-05-04';
const PLUS_2_YEARS = '2028-05-04';

function uniqueServices(rows: Array<{ service_line: string }>): string[] {
  return [...new Set(rows.map(r => r.service_line))];
}

function lineFor(r: any) {
  return {
    service_line: r.service_line,
    category: r.category,
    line_code: r.line_code,
    label_en: r.label_en,
    label_ar: r.label_ar ?? null,
    qty: r.qty,
    unit_cost: r.unit_cost,
    ctc_net: r.ctc_net ?? null,
    ctc_relievers: r.ctc_relievers ?? null,
    ctc_ot: r.ctc_ot ?? null,
    ctc_training: r.ctc_training ?? null,
    ctc_insurance: r.ctc_insurance ?? null,
    ctc_medical: r.ctc_medical ?? null,
  };
}

async function main() {
  const contracts: OutputContract[] = [];

  // 1. AUC (single year)
  const auc = await parseAucStyle(`${FMPLUS}/AUC Budget.xlsx`);
  contracts.push({
    name: 'AUC',
    project_id: 2,
    year_tracking: 'contract',
    start_date: TODAY,
    end_date: PLUS_1_YEAR,
    contract_value: 0,
    customer: 'American University in Cairo',
    zones: ['NC Inner Campus', 'Outer Campus', 'NC Off-Campus Housing', 'Maadi Buildings'],
    services: uniqueServices(auc.rows),
    years: [{ year_index: 1, lines: auc.rows.map(lineFor) }],
  });

  // 2. City Gate (multi-year)
  const cg = await parseCityGateMultiYear(`${FMPLUS}/City Gate Budget.xlsx`);
  const cgYears = [...new Set(cg.rows.map(r => r.year_index))].sort();
  contracts.push({
    name: 'City Gate',
    project_id: 45,
    year_tracking: 'contract',
    start_date: TODAY,
    end_date: PLUS_2_YEARS,
    contract_value: 0,
    customer: 'SODIC',
    zones: [],
    services: uniqueServices(cg.rows),
    years: cgYears.map(yi => ({
      year_index: yi,
      lines: cg.rows.filter(r => r.year_index === yi).map(lineFor),
    })),
  });

  // 3. Emaar Uptown
  const em = await parseEmaarZoneStyle(`${FMPLUS}/Emaar Uptown HK Budget.xlsx`);
  contracts.push({
    name: 'Uptown EMAAR',
    project_id: 22,
    year_tracking: 'contract',
    start_date: TODAY,
    end_date: PLUS_1_YEAR,
    contract_value: 0,
    customer: 'Emaar Misr',
    zones: em.zones,
    services: uniqueServices(em.rows),
    years: [{ year_index: 1, lines: em.rows.map(lineFor) }],
  });

  // 4. TRIO
  const trio = await parseTrioStyle(`${FMPLUS}/TRIO Budget .xlsx`);
  contracts.push({
    name: 'TRIO COMPOUND',
    project_id: 33,
    year_tracking: 'contract',
    start_date: TODAY,
    end_date: PLUS_1_YEAR,
    contract_value: 0,
    customer: 'SODIC',
    zones: [],
    services: uniqueServices(trio.rows),
    years: [{ year_index: 1, lines: trio.rows.map(lineFor) }],
  });

  console.log(JSON.stringify({ contracts }, null, 2));
  // Stderr summary so we see counts even if stdout is captured
  for (const c of contracts) {
    const totalLines = c.years.reduce((a, y) => a + y.lines.length, 0);
    console.error(`${c.name} (project_id=${c.project_id}): ${c.services.length} services, ${c.years.length} year(s), ${totalLines} lines`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
