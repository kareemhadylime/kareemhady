'use server';

import { revalidatePath } from 'next/cache';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectParser } from '@/lib/fmplus/budget/parsers/auto-detect';
import { parseFlatTemplate, type FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
import { parseAucStyle } from '@/lib/fmplus/budget/parsers/rich-auc-style';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';

export interface PreviewResult {
  parser: string;
  reason: string;
  sheetNames: string[];
  rows: FlatRow[];
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
  // Diff summary against existing data (per contract+year)
  byContract: Array<{
    contract_name: string;
    year_index: number;
    line_count: number;
    contract_exists: boolean;
    year_exists: boolean;
  }>;
}

/**
 * Inspect an uploaded XLSX, classify it, parse it, and return a preview of
 * what would be imported. Does NOT write to DB.
 *
 * Supported parsers: flat-template, rich-auc-style.
 * Deferred (v2.2): trio-style, city-gate-multi-year, emaar-zone-style.
 */
export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  await requireBudgetAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file uploaded.');
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const tmp = join(tmpdir(), `import-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await writeFile(tmp, buf);

  try {
    const detection = await detectParser(tmp);

    // Gate unsupported parsers — rich-auc-style is now live, others remain deferred
    if (
      detection.parser === 'unknown' ||
      detection.parser === 'trio-style' ||
      detection.parser === 'city-gate-multi-year' ||
      detection.parser === 'emaar-zone-style'
    ) {
      return {
        parser: detection.parser,
        reason: detection.reason,
        sheetNames: detection.sheetNames,
        rows: [],
        errors: [{
          row: 0,
          message: `${detection.parser} parser is not yet implemented. ` +
            `Re-export your data using the flat template (Download Blank Template button) and try again. ` +
            `Rich parsers for TRIO/CityGate/Emaar layouts are tracked for v2.2.`,
        }],
        warnings: [],
        byContract: [],
      };
    }

    let parsed: {
      rows: FlatRow[];
      errors: Array<{ row: number; message: string }>;
      warnings: string[];
      suggestedContractName?: string;
    };

    if (detection.parser === 'flat-template') {
      parsed = await parseFlatTemplate(tmp);
    } else if (detection.parser === 'rich-auc-style') {
      const aucResult = await parseAucStyle(tmp);
      parsed = {
        rows: aucResult.rows.map(r => ({
          contract_name: aucResult.contract_name,
          customer: null,
          year_index: 1,
          service_line: r.service_line,
          category: r.category,
          line_code: r.line_code,
          label_en: r.label_en,
          label_ar: r.label_ar,
          season: 'high' as const,
          qty: r.qty,
          unit_cost: r.unit_cost,
          ctc_net: null,
          ctc_relievers: null,
          ctc_ot: null,
          ctc_training: null,
          ctc_insurance: null,
          ctc_medical: null,
          threshold_green: null,
          threshold_amber: null,
          notes: null,
        })),
        errors: aucResult.errors.map(e => ({ row: e.row, message: `${e.sheet}: ${e.message}` })),
        warnings: aucResult.validation.warnings,
        suggestedContractName: aucResult.contract_name,
      };
    } else {
      // Defensive — should never reach
      throw new Error(`Unhandled parser: ${detection.parser}`);
    }

    // Diff: per (contract_name, year_index)
    const sb = budgetDb();
    const byKey = new Map<string, { contract_name: string; year_index: number; line_count: number }>();
    for (const r of parsed.rows) {
      const k = `${r.contract_name}|${r.year_index}`;
      const cur = byKey.get(k);
      if (cur) cur.line_count++;
      else byKey.set(k, { contract_name: r.contract_name, year_index: r.year_index, line_count: 1 });
    }
    const byContract: PreviewResult['byContract'] = [];
    for (const grp of byKey.values()) {
      const { data: contract } = await sb.from(TABLES.contracts)
        .select('id')
        .eq('name', grp.contract_name)
        .maybeSingle();
      let yearExists = false;
      if (contract) {
        const { data: yr } = await sb.from(TABLES.years)
          .select('id')
          .eq('contract_id', (contract as { id: number }).id)
          .eq('year_index', grp.year_index)
          .eq('scenario', 'initial')
          .maybeSingle();
        yearExists = !!yr;
      }
      byContract.push({
        contract_name: grp.contract_name,
        year_index: grp.year_index,
        line_count: grp.line_count,
        contract_exists: !!contract,
        year_exists: yearExists,
      });
    }

    return {
      parser: detection.parser,
      reason: detection.reason,
      sheetNames: detection.sheetNames,
      rows: parsed.rows,
      errors: parsed.errors,
      warnings: parsed.warnings,
      byContract,
    };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/**
 * Commit a preview's parsed rows to DB. Only callable AFTER previewImportAction.
 * - Skips groups whose contract or year doesn't exist (caller should warn).
 * - For each (contract, year), replaces ALL existing budget_lines for that year
 *   (across all services) with the imported rows. This is destructive — preview
 *   should make this clear to the user.
 */
export async function commitImportAction(rows: FlatRow[]): Promise<{ committed: number; skipped: number; errors: string[] }> {
  await requireBudgetAdmin();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { committed: 0, skipped: 0, errors: ['No rows to commit'] };
  }

  const sb = budgetDb();
  let committed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Group rows by (contract_name, year_index)
  const groups = new Map<string, FlatRow[]>();
  for (const r of rows) {
    const k = `${r.contract_name}|${r.year_index}`;
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }

  for (const [key, grpRows] of groups) {
    const [contractName, yearIdxStr] = key.split('|');
    const yearIndex = Number(yearIdxStr);

    const { data: contract } = await sb.from(TABLES.contracts)
      .select('id')
      .eq('name', contractName)
      .maybeSingle();
    if (!contract) {
      skipped += grpRows.length;
      errors.push(`Contract "${contractName}" not found — skipping ${grpRows.length} lines.`);
      continue;
    }
    const { data: year } = await sb.from(TABLES.years)
      .select('id, status')
      .eq('contract_id', (contract as { id: number }).id)
      .eq('year_index', yearIndex)
      .eq('scenario', 'initial')
      .maybeSingle();
    if (!year) {
      skipped += grpRows.length;
      errors.push(`${contractName} Y${yearIndex} not found — skipping ${grpRows.length} lines.`);
      continue;
    }
    if ((year as { status: string }).status === 'published') {
      skipped += grpRows.length;
      errors.push(`${contractName} Y${yearIndex} is published — refusing to overwrite. Create a revised scenario first.`);
      continue;
    }

    // Replace lines for this year (all services)
    await sb.from(TABLES.lines).delete().eq('year_id', (year as { id: number }).id);
    const insertRows = grpRows.map(r => ({
      year_id: (year as { id: number }).id,
      service_line: r.service_line,
      category: r.category,
      line_code: r.line_code,
      catalog_item_id: null,
      label_en: r.label_en,
      label_ar: r.label_ar,
      season: r.season,
      qty: r.qty,
      unit_cost: r.unit_cost,
      ctc_net: r.ctc_net,
      ctc_relievers: r.ctc_relievers,
      ctc_ot: r.ctc_ot,
      ctc_training: r.ctc_training,
      ctc_insurance: r.ctc_insurance,
      ctc_medical: r.ctc_medical,
      threshold_green: r.threshold_green,
      threshold_amber: r.threshold_amber,
      notes: r.notes,
    }));
    const { error } = await sb.from(TABLES.lines).insert(insertRows);
    if (error) {
      errors.push(`${contractName} Y${yearIndex}: ${error.message}`);
      skipped += grpRows.length;
    } else {
      committed += grpRows.length;
    }
  }

  revalidatePath('/fmplus/financial/budget');
  revalidatePath('/fmplus/financial/budget/edit');
  return { committed, skipped, errors };
}
