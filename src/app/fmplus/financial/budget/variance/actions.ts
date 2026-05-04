'use server';

import { requireBudgetView } from '@/lib/fmplus/budget/permissions';

/**
 * Placeholder for variance-export server actions. Task 39 will add
 * exportVariancePdfAction and exportVarianceXlsxAction here. For now
 * the variance/actions.ts file exists so route imports don't break.
 */
export async function _placeholder() {
  await requireBudgetView();
}
