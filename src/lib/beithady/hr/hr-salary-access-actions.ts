// src/lib/beithady/hr/hr-salary-access-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { validateSalaryTier } from './hr-salary-access-queries';
import type { SalaryTier } from './hr-salary-access-queries';

/**
 * Upsert a salary access tier for a dashboard user.
 * Requires hr:full permission (admin or manager Beithady role).
 */
export async function setSalaryAccessTierAction(
  userId: string,
  tier: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');

    if (!userId || typeof userId !== 'string') {
      return { ok: false, error: 'Invalid user ID' };
    }
    if (!validateSalaryTier(tier)) {
      return { ok: false, error: 'Tier must be an integer between 0 and 4' };
    }

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_salary_access')
      .upsert(
        {
          account_id: userId,
          tier: tier as SalaryTier,
          granted_by: user.id,
          granted_at: new Date().toISOString(),
        },
        { onConflict: 'account_id' }
      );

    if (error) return { ok: false, error: error.message };

    revalidatePath('/beithady/hr/salary-access');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
