'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { resolveCatalogPrice } from '@/lib/fmplus/budget/catalog/overrides';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { ServiceLineEnum, CategoryEnum, SeasonEnum } from '@/lib/fmplus/budget/schema';

const AddLineInputSchema = z.object({
  contract_id: z.number().int().positive(),
  year_id: z.number().int().positive(),
  service_line: ServiceLineEnum,
  category: CategoryEnum,
  // Catalog-driven path
  catalog_item_id: z.number().int().positive().nullable().optional(),
  // Required line attributes (override or free-text)
  line_code: z.string().min(1),
  label_en: z.string().min(1),
  label_ar: z.string().nullable().optional(),
  season: SeasonEnum.default('high'),
  qty: z.number().nonnegative().default(0),
  // unit_cost: when catalog_item_id is set, server resolves price (override > default).
  // For free-text, client supplies it.
  unit_cost: z.number().nonnegative().nullable().optional(),
});

/**
 * Append a new budget_line to (year_id, service_line, category).
 * If `catalog_item_id` is provided, server resolves the unit_cost via
 * `resolveCatalogPrice(contract, item)` (override-first). Otherwise uses
 * the client-supplied `unit_cost` (free-text).
 */
export async function addLineAction(input: unknown) {
  await requireBudgetAdmin();
  const parsed = AddLineInputSchema.parse(input);
  const sb = budgetDb();

  // Resolve unit_cost
  let unitCost = parsed.unit_cost ?? 0;
  if (parsed.catalog_item_id) {
    const resolved = await resolveCatalogPrice({
      contractId: parsed.contract_id,
      catalogItemId: parsed.catalog_item_id,
    });
    unitCost = resolved.unit_cost;
  }

  // Verify the year is editable (status=draft)
  const { data: year, error: yErr } = await sb.from(TABLES.years)
    .select('status, contract_id')
    .eq('id', parsed.year_id)
    .single();
  if (yErr || !year) throw new Error('Year not found');
  if (year.status !== 'draft') {
    throw new Error('Cannot add lines to a published year. Create a revised scenario first.');
  }

  const insertRow = {
    year_id: parsed.year_id,
    service_line: parsed.service_line,
    category: parsed.category,
    line_code: parsed.line_code,
    catalog_item_id: parsed.catalog_item_id ?? null,
    label_en: parsed.label_en,
    label_ar: parsed.label_ar ?? null,
    season: parsed.season,
    qty: parsed.qty,
    unit_cost: unitCost,
  };

  const { error } = await sb.from(TABLES.lines).insert(insertRow);
  if (error) throw error;

  revalidatePath('/fmplus/financial/budget/edit');
}
