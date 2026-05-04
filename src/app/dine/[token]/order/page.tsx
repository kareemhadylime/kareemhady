import 'server-only';
import { notFound } from 'next/navigation';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { BrandShell } from '../_components/brand-shell';
import { CartView } from './_components/cart-view';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

export default async function CartPage({ params }: Ctx) {
  const { token } = await params;
  const c = await validateDineToken(token);
  if (!c.ok) notFound();

  const sb = supabaseAdmin();
  const { data: bld } = await sb
    .from('fnb_buildings')
    .select('delivery_sla_minutes, cancellation_grace_seconds')
    .eq('building_code', c.building_code)
    .single();

  return (
    <BrandShell
      guestName={c.guest_name}
      buildingCode={c.building_code}
      unitCode={c.unit_code}
      lang="en"
    >
      <CartView
        token={token}
        buildingCode={c.building_code}
        unitCode={c.unit_code}
        deliverySlaMinutes={(bld as { delivery_sla_minutes: number } | null)?.delivery_sla_minutes ?? 30}
      />
    </BrandShell>
  );
}
