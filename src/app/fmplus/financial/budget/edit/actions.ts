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

const UpdateLineCtcInputSchema = z.object({
  line_id: z.number().int().positive(),
  ctc_net: z.number().nullable(),
  ctc_relievers: z.number().nullable(),
  ctc_ot: z.number().nullable(),
  ctc_training: z.number().nullable(),
  ctc_insurance: z.number().nullable(),
  ctc_medical: z.number().nullable(),
  threshold_green: z.number().nullable(),
  threshold_amber: z.number().nullable(),
});

/**
 * Update CTC component fields and per-line variance thresholds on a manning line.
 * Recomputes `unit_cost = sum(ctc_*)` automatically when at least one component is non-null.
 * Otherwise leaves `unit_cost` untouched (free-text rows keep their hand-entered value).
 */
export async function updateLineCtcAction(input: unknown) {
  await requireBudgetAdmin();
  const parsed = UpdateLineCtcInputSchema.parse(input);
  const sb = budgetDb();

  // Verify the year this line belongs to is editable
  const { data: lineRow, error: lErr } = await sb
    .from(TABLES.lines)
    .select('id, year_id')
    .eq('id', parsed.line_id)
    .single();
  if (lErr || !lineRow) throw new Error('Line not found');

  const { data: year } = await sb.from(TABLES.years)
    .select('status')
    .eq('id', lineRow.year_id)
    .single();
  if (!year || year.status !== 'draft') {
    throw new Error('Cannot edit lines on a published year. Create a revised scenario first.');
  }

  // Compute new unit_cost as sum of CTC components (only if at least one non-null)
  const components = [
    parsed.ctc_net, parsed.ctc_relievers, parsed.ctc_ot,
    parsed.ctc_training, parsed.ctc_insurance, parsed.ctc_medical,
  ];
  const hasAny = components.some(c => c !== null);
  const sum = hasAny ? components.reduce((a, b) => (a ?? 0) + (b ?? 0), 0 as number) : null;

  const updateRow: Record<string, unknown> = {
    ctc_net: parsed.ctc_net,
    ctc_relievers: parsed.ctc_relievers,
    ctc_ot: parsed.ctc_ot,
    ctc_training: parsed.ctc_training,
    ctc_insurance: parsed.ctc_insurance,
    ctc_medical: parsed.ctc_medical,
    threshold_green: parsed.threshold_green,
    threshold_amber: parsed.threshold_amber,
  };
  if (sum !== null) updateRow.unit_cost = sum;

  const { error } = await sb.from(TABLES.lines).update(updateRow).eq('id', parsed.line_id);
  if (error) throw error;

  revalidatePath('/fmplus/financial/budget/edit');
}
