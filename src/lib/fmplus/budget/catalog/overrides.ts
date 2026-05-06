import { budgetDb, TABLES } from '../db';

export interface ResolvedPrice {
  unit_cost: number;
  source: 'override' | 'default';
}

/**
 * Resolve the effective unit price for a catalog item in the context of a
 * specific contract. Per-contract override wins; falls back to catalog default.
 */
export async function resolveCatalogPrice(opts: {
  contractId: number;
  catalogItemId: number;
}): Promise<ResolvedPrice> {
  const sb = budgetDb();
  const [override, item] = await Promise.all([
    sb.from(TABLES.overrides)
      .select('unit_cost')
      .eq('contract_id', opts.contractId)
      .eq('catalog_item_id', opts.catalogItemId)
      .maybeSingle(),
    sb.from(TABLES.catalog).select('default_price').eq('id', opts.catalogItemId).single(),
  ]);
  if (override.data?.unit_cost != null) {
    return { unit_cost: Number(override.data.unit_cost), source: 'override' };
  }
  if (item.data) {
    return { unit_cost: Number(item.data.default_price), source: 'default' };
  }
  throw new Error(`Catalog item ${opts.catalogItemId} not found`);
}

/**
 * List all overrides for a single contract. Joins catalog item details for UI.
 */
export async function listOverridesForContract(contractId: number) {
  const sb = budgetDb();
  const { data, error } = await sb
    .from(TABLES.overrides)
    .select('*, fmplus_catalog ( name_en, name_ar, default_price, unit )')
    .eq('contract_id', contractId);
  if (error) throw error;
  return data ?? [];
}

/**
 * List overrides for a single catalog item across all contracts. Used by
 * the override side panel to show "Other overrides for this item".
 */
export async function listOverridesForItem(catalogItemId: number) {
  const sb = budgetDb();
  const { data, error } = await sb
    .from(TABLES.overrides)
    .select('*, project_contracts ( name )')
    .eq('catalog_item_id', catalogItemId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Insert or update a per-contract price override.
 * Caller must have `requireBudgetAdmin()` upstream.
 */
export async function upsertOverride(input: {
  contract_id: number;
  catalog_item_id: number;
  unit_cost: number;
  notes?: string | null;
}): Promise<void> {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.overrides).upsert(input, {
    onConflict: 'contract_id,catalog_item_id',
  });
  if (error) throw error;
}

/**
 * Remove a per-contract price override. Falls back to catalog default afterward.
 * Caller must have `requireBudgetAdmin()` upstream.
 */
export async function removeOverride(contractId: number, catalogItemId: number): Promise<void> {
  const sb = budgetDb();
  const { error } = await sb
    .from(TABLES.overrides)
    .delete()
    .eq('contract_id', contractId)
    .eq('catalog_item_id', catalogItemId);
  if (error) throw error;
}
