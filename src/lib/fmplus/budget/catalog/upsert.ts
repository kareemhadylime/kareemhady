import { budgetDb, TABLES } from '../db';
import { FmplusCatalogItemSchema, type FmplusCatalogItem } from '../schema';

/**
 * Insert or update a catalog item. Conflict resolution by `code`.
 * Caller must have `requireBudgetAdmin()` upstream.
 */
export async function upsertCatalogItem(input: unknown): Promise<FmplusCatalogItem> {
  const parsed = FmplusCatalogItemSchema.parse(input);
  const sb = budgetDb();
  const { data, error } = await sb
    .from(TABLES.catalog)
    .upsert(parsed, { onConflict: 'code' })
    .select()
    .single();
  if (error) throw error;
  return data as FmplusCatalogItem;
}

/**
 * Soft-delete a catalog item by flipping is_active=false. Existing budget_lines
 * with this catalog_item_id remain intact (FK has no cascade).
 */
export async function archiveCatalogItem(id: number): Promise<void> {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.catalog).update({ is_active: false }).eq('id', id);
  if (error) throw error;
}
