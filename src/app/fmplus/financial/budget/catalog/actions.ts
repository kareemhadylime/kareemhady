'use server';

import { upsertCatalogItem, archiveCatalogItem } from '@/lib/fmplus/budget/catalog/upsert';
import { upsertOverride, removeOverride } from '@/lib/fmplus/budget/catalog/overrides';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { revalidatePath } from 'next/cache';

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
