'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';

const SettingsInputSchema = z.object({
  green_pct: z.number().min(0).max(100),
  amber_pct: z.number().min(0).max(100),
  default_scenario: z.enum(['initial', 'revised', 'reforecast']),
  default_inflation_revenue: z.number().min(0).max(50),
  default_inflation_manpower: z.number().min(0).max(50),
  default_inflation_other: z.number().min(0).max(50),
  default_mob_amortization_months: z.number().int().min(1).max(120),
  bilingual_default: z.enum(['en', 'ar']),
});

/**
 * Update the singleton budget_settings row (id=1). All fields required to
 * avoid partial writes; the form submits the full set on every Save.
 */
export async function saveSettingsAction(input: unknown) {
  await requireBudgetAdmin();
  const parsed = SettingsInputSchema.parse(input);
  const sb = budgetDb();

  const { error } = await sb.from(TABLES.settings)
    .update(parsed)
    .eq('id', 1);
  if (error) throw error;

  revalidatePath('/fmplus/financial/budget/settings');
  revalidatePath('/fmplus/financial/budget');
}
