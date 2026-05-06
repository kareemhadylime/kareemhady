'use server';

import { upsertCatalogItem, archiveCatalogItem } from '@/lib/fmplus/budget/catalog/upsert';
import { upsertOverride, removeOverride } from '@/lib/fmplus/budget/catalog/overrides';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { revalidatePath } from 'next/cache';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePricelist } from '@/lib/fmplus/budget/catalog/seed-from-pricelist';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';

const CATALOG_ROUTE = '/fmplus/financial/budget/catalog';

export async function saveItemAction(input: unknown) {
  await requireBudgetAdmin();
  const out = await upsertCatalogItem(input);
  revalidatePath(CATALOG_ROUTE);
  return out;
}

export async function archiveItemAction(id: number) {
  await requireBudgetAdmin();
  await archiveCatalogItem(id);
  revalidatePath(CATALOG_ROUTE);
}

export async function saveOverrideAction(input: {
  contract_id: number;
  catalog_item_id: number;
  unit_cost: number;
  notes?: string | null;
}) {
  await requireBudgetAdmin();
  await upsertOverride(input);
  revalidatePath(CATALOG_ROUTE);
}

export async function removeOverrideAction(contractId: number, catalogItemId: number) {
  await requireBudgetAdmin();
  await removeOverride(contractId, catalogItemId);
  revalidatePath(CATALOG_ROUTE);
}

export interface BulkImportSummary {
  total: number;
  added: number;
  updated: number;
  archived: number;
  errors: string[];
}

/**
 * Parse an uploaded XLSX (Items Pricelist shape) and upsert into fmplus_catalog.
 * Items in the catalog whose codes are NOT in the import are NOT auto-archived
 * (caller can choose to archive separately via UI). Returns diff stats.
 *
 * Caller must have admin access — gated by `requireBudgetAdmin()`.
 */
export async function bulkImportAction(formData: FormData): Promise<BulkImportSummary> {
  await requireBudgetAdmin();

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new Error('No file uploaded — expected FormData field "file"');
  }
  if (file.size === 0) {
    throw new Error('Uploaded file is empty');
  }

  // Write to a temp path so exceljs can read from disk
  const buf = Buffer.from(await file.arrayBuffer());
  const tmp = join(tmpdir(), `catalog-import-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await writeFile(tmp, buf);

  let rows;
  try {
    rows = await parsePricelist(tmp);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw new Error(`Parser failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await unlink(tmp).catch(() => {});

  if (rows.length === 0) {
    return { total: 0, added: 0, updated: 0, archived: 0, errors: ['No valid rows extracted'] };
  }

  // Diff against current catalog (active OR archived — we look up by code)
  const sb = budgetDb();
  const incomingCodes = rows.map(r => r.code);
  const { data: existing, error: fetchErr } = await sb
    .from(TABLES.catalog)
    .select('code, default_price, is_active')
    .in('code', incomingCodes);
  if (fetchErr) throw fetchErr;

  const byCode = new Map<string, { code: string; default_price: number; is_active: boolean }>();
  for (const e of existing ?? []) {
    byCode.set(e.code, e as { code: string; default_price: number; is_active: boolean });
  }

  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const cur = byCode.get(r.code);
    if (!cur) {
      added++;
    } else if (Number(cur.default_price) !== r.default_price || !cur.is_active) {
      updated++;
    }
  }

  // Upsert (rows is already validated by parsePricelist)
  const { error: upErr } = await sb.from(TABLES.catalog).upsert(rows, { onConflict: 'code' });
  if (upErr) throw upErr;

  revalidatePath(CATALOG_ROUTE);

  return { total: rows.length, added, updated, archived: 0, errors: [] };
}
