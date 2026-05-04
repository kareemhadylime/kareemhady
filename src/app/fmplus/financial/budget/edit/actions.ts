'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { resolveCatalogPrice } from '@/lib/fmplus/budget/catalog/overrides';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { ServiceLineEnum, CategoryEnum, SeasonEnum } from '@/lib/fmplus/budget/schema';
import { writeAuditOnPublishedEdit } from '@/lib/fmplus/budget/audit';

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

/**
 * Bulk-replace all budget_lines for (year_id, service_line). Used by Editor
 * when saving the draft after inline edits. The Editor passes the full set
 * of lines for the active service tab.
 */
const SaveDraftInputSchema = z.object({
  year_id: z.number().int().positive(),
  service_line: ServiceLineEnum,
  lines: z.array(z.object({
    line_code: z.string(),
    catalog_item_id: z.number().nullable(),
    label_en: z.string(),
    label_ar: z.string().nullable(),
    category: CategoryEnum,
    season: SeasonEnum,
    qty: z.number().nonnegative(),
    unit_cost: z.number().nonnegative(),
    ctc_net: z.number().nullable(),
    ctc_relievers: z.number().nullable(),
    ctc_ot: z.number().nullable(),
    ctc_training: z.number().nullable(),
    ctc_insurance: z.number().nullable(),
    ctc_medical: z.number().nullable(),
    threshold_green: z.number().nullable(),
    threshold_amber: z.number().nullable(),
  })),
});

export async function saveDraftAction(input: unknown) {
  const user = await requireBudgetAdmin();
  const parsed = SaveDraftInputSchema.parse(input);
  const sb = budgetDb();

  const { data: year } = await sb.from(TABLES.years)
    .select('status, contract_id')
    .eq('id', parsed.year_id)
    .single();
  if (!year) throw new Error('Year not found');

  // Replace lines atomically (delete + insert, no transaction since Supabase JS lacks them)
  const { error: delErr } = await sb.from(TABLES.lines)
    .delete()
    .eq('year_id', parsed.year_id)
    .eq('service_line', parsed.service_line);
  if (delErr) throw delErr;

  if (parsed.lines.length > 0) {
    const insertRows = parsed.lines.map(l => ({
      year_id: parsed.year_id,
      service_line: parsed.service_line,
      ...l,
    }));
    const { error: insErr } = await sb.from(TABLES.lines).insert(insertRows);
    if (insErr) throw insErr;
  }

  // If editing a published year, log to audit
  if (year.status === 'published') {
    await writeAuditOnPublishedEdit(parsed.year_id, {
      trigger: 'save_draft_after_publish',
      service_line: parsed.service_line,
      line_count: parsed.lines.length,
      by: user.id,
    });
  }

  revalidatePath('/fmplus/financial/budget/edit');
}

/**
 * Set a year's status to 'published'. Records published_at + published_by.
 * If the year was already published, treats this as a republish and writes audit.
 */
export async function publishYearAction(yearId: number) {
  const user = await requireBudgetAdmin();
  const sb = budgetDb();

  const { data: year } = await sb.from(TABLES.years)
    .select('status')
    .eq('id', yearId)
    .single();
  if (!year) throw new Error('Year not found');

  const { error } = await sb.from(TABLES.years)
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: user.id,
    })
    .eq('id', yearId);
  if (error) throw error;

  if (year.status === 'published') {
    await writeAuditOnPublishedEdit(yearId, { trigger: 'republish', by: user.id });
  }

  revalidatePath('/fmplus/financial/budget/edit');
}

/**
 * Delete a year. Cascades to project_year_services + budget_lines via FK.
 * Refuses to delete the last year of a contract — guard against orphaning the contract.
 */
export async function deleteYearAction(yearId: number) {
  await requireBudgetAdmin();
  const sb = budgetDb();

  const { data: year } = await sb.from(TABLES.years)
    .select('contract_id, year_index, scenario')
    .eq('id', yearId)
    .single();
  if (!year) throw new Error('Year not found');

  const { count } = await sb.from(TABLES.years)
    .select('*', { count: 'exact', head: true })
    .eq('contract_id', year.contract_id)
    .eq('scenario', year.scenario);
  if ((count ?? 0) <= 1) {
    throw new Error('Cannot delete the only year of a contract. Delete the contract from Project Hub instead.');
  }

  const { error } = await sb.from(TABLES.years).delete().eq('id', yearId);
  if (error) throw error;

  revalidatePath('/fmplus/financial/budget/edit');
}

/**
 * Create a new (blank) year on a contract. Auto-increments year_index.
 * For copy-with-inflation, see Task 27's copyYearAction.
 */
const AddYearInputSchema = z.object({
  contract_id: z.number().int().positive(),
});

export async function addYearAction(input: unknown) {
  await requireBudgetAdmin();
  const parsed = AddYearInputSchema.parse(input);
  const sb = budgetDb();

  // Find existing years to derive next index
  const { data: years } = await sb.from(TABLES.years)
    .select('year_index, fiscal_year')
    .eq('contract_id', parsed.contract_id)
    .eq('scenario', 'initial')
    .order('year_index', { ascending: false });

  const nextIndex = (years?.[0]?.year_index ?? 0) + 1;
  if (nextIndex > 10) {
    throw new Error('Refusing to create year_index > 10. Sanity check.');
  }

  const { data: contract } = await sb.from(TABLES.contracts)
    .select('year_tracking, vat_pct, start_date')
    .eq('id', parsed.contract_id)
    .single();
  if (!contract) throw new Error('Contract not found');

  const fiscalYear = contract.year_tracking === 'fiscal'
    ? (years?.[0]?.fiscal_year ? years[0].fiscal_year + 1 : new Date().getFullYear() + 1)
    : null;

  const { data: newYear, error: yErr } = await sb.from(TABLES.years).insert({
    contract_id: parsed.contract_id,
    year_index: nextIndex,
    fiscal_year: fiscalYear,
    start_month: 1,
    scenario: 'initial',
    status: 'draft',
  }).select().single();
  if (yErr) throw yErr;

  // Seed empty year_services rows for every service the contract has
  const { data: contractServices } = await sb.from(TABLES.services)
    .select('service_line, template_version')
    .eq('contract_id', parsed.contract_id);

  if (contractServices && contractServices.length > 0) {
    await sb.from(TABLES.year_services).insert(
      contractServices.map(s => ({
        year_id: newYear.id,
        service_line: s.service_line,
        monthly_revenue: 0,
        vat_pct: contract.vat_pct ?? 14,
      }))
    );
  }

  revalidatePath('/fmplus/financial/budget/edit');
  return { year_id: newYear.id, year_index: newYear.year_index };
}

const SaveRevenueInputSchema = z.object({
  year_id: z.number().int().positive(),
  rows: z.array(z.object({
    service_line: ServiceLineEnum,
    monthly_revenue: z.number().nonnegative(),
    vat_pct: z.number().nonnegative(),
    manpower_ramp: z.record(z.string(), z.number()).default({}),
  })),
});

/**
 * Replace all project_year_services rows for a given year. Each row carries
 * a service_line, monthly revenue, VAT, and an optional manpower_ramp jsonb
 * that overrides default headcount per role. Used by the Revenue tab.
 */
export async function saveRevenueAction(input: unknown) {
  await requireBudgetAdmin();
  const parsed = SaveRevenueInputSchema.parse(input);
  const sb = budgetDb();

  const { data: year } = await sb.from(TABLES.years)
    .select('status')
    .eq('id', parsed.year_id)
    .single();
  if (!year) throw new Error('Year not found');
  if (year.status === 'published') {
    throw new Error('Cannot edit revenue on a published year. Create a revised scenario first.');
  }

  await sb.from(TABLES.year_services).delete().eq('year_id', parsed.year_id);
  if (parsed.rows.length > 0) {
    const insertRows = parsed.rows.map(r => ({ year_id: parsed.year_id, ...r }));
    const { error } = await sb.from(TABLES.year_services).insert(insertRows);
    if (error) throw error;
  }

  revalidatePath('/fmplus/financial/budget/edit');
}

const SaveMobilizationInputSchema = z.object({
  contract_id: z.number().int().positive(),
  rows: z.array(z.object({
    category: z.enum(['capex','opex_one_time','training','recruitment']),
    label_en: z.string().min(1),
    label_ar: z.string().nullable(),
    qty: z.number().nonnegative(),
    unit_cost: z.number().nonnegative(),
    amortization: z.enum(['straight_line','flat']),
    amortization_months: z.number().int().positive(),
    notes: z.string().nullable(),
  })),
});

/**
 * Replace all mobilization_lines for a contract. Mobilization is a
 * contract-level (not year-level) entity per spec § 4 Q6 — amortized into
 * variance over the contract duration via Task 34's amortizeMobilization().
 */
export async function saveMobilizationAction(input: unknown) {
  await requireBudgetAdmin();
  const parsed = SaveMobilizationInputSchema.parse(input);
  const sb = budgetDb();

  await sb.from(TABLES.mob).delete().eq('contract_id', parsed.contract_id);
  if (parsed.rows.length > 0) {
    const insertRows = parsed.rows.map(r => ({ contract_id: parsed.contract_id, ...r }));
    const { error } = await sb.from(TABLES.mob).insert(insertRows);
    if (error) throw error;
  }

  revalidatePath('/fmplus/financial/budget/edit');
}
