import { CatalogueDetail } from '../../../_components/catalogue/catalogue-detail';
import { OWNER_TABS } from '../../../_components/tabs';
import { requireBoatRoleOrThrow } from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { OwnerPricingEditForm } from '../../_components/owner-pricing-edit-form';

export const dynamic = 'force-dynamic';

export default async function OwnerInventoryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireBoatRoleOrThrow('owner');
  const ownerIds = await getOwnedOwnerIds(me);
  const { id } = await params;

  // Ownership check — 404 rather than exposing a forbidden error.
  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('id, name, owner_id')
    .eq('id', id)
    .maybeSingle();
  const boat = boatRow as { id: string; name: string; owner_id: string } | null;
  if (!boat || !ownerIds.includes(boat.owner_id)) notFound();

  // Fetch current pricing for this boat.
  const { data: pricingRows } = await sb
    .from('boat_rental_pricing')
    .select('tier, amount_egp')
    .eq('boat_id', boat.id);
  const pricing: Record<'weekday' | 'weekend' | 'season', number> = {
    weekday: 0,
    weekend: 0,
    season: 0,
  };
  for (const row of (pricingRows as Array<{ tier: string; amount_egp: string | number }> | null) ?? []) {
    if (row.tier === 'weekday' || row.tier === 'weekend' || row.tier === 'season') {
      pricing[row.tier] = Number(row.amount_egp);
    }
  }

  return (
    <>
      <CatalogueDetail
        boatId={id}
        scope={{ kind: 'own-only', ownerIds }}
        basePath="/emails/boat-rental/owner/inventory"
        tabs={OWNER_TABS}
        currentPath="/emails/boat-rental/owner/inventory"
      />
      <section className="mt-6">
        <OwnerPricingEditForm
          boatId={boat.id}
          boatName={boat.name}
          initialPricing={pricing}
        />
      </section>
    </>
  );
}
