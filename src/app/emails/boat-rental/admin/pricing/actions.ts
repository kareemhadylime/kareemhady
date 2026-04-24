'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, nOrNull } from '@/lib/boat-rental/server-helpers';

export async function upsertPricingAction(formData: FormData) {
  await requireBoatAdmin();
  const boatId = s(formData.get('boat_id'));
  if (!boatId) return;
  const sb = supabaseAdmin();
  const rows: Array<{ boat_id: string; tier: 'weekday' | 'weekend' | 'season'; amount_egp: number }> = [];
  for (const tier of ['weekday', 'weekend', 'season'] as const) {
    const amt = nOrNull(formData.get(`amount_${tier}`));
    if (amt === null || amt < 0) continue;
    rows.push({ boat_id: boatId, tier, amount_egp: amt });
  }
  if (!rows.length) return;
  // One upsert per tier since the unique constraint is (boat_id, tier).
  for (const row of rows) {
    await sb
      .from('boat_rental_pricing')
      .upsert(
        { ...row, updated_at: new Date().toISOString() },
        { onConflict: 'boat_id,tier' }
      );
  }
  revalidatePath('/emails/boat-rental/admin/pricing');
}
