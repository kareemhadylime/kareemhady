import 'server-only';
import { notFound } from 'next/navigation';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { BrandShell } from '../../_components/brand-shell';
import { OrderStatusView } from './_components/order-status-view';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string; id: string }> }

export default async function OrderConfirmationPage({ params }: Ctx) {
  const { token, id } = await params;
  const c = await validateDineToken(token);
  if (!c.ok) notFound();

  const sb = supabaseAdmin();
  const [orderRes, linesRes, bldRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', id).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', id),
    sb.from('fnb_buildings').select('cancellation_grace_seconds')
      .eq('building_code', c.building_code).single(),
  ]);
  if (!orderRes.data) notFound();
  const order = orderRes.data as { reservation_id: string };
  if (order.reservation_id !== c.reservation_id) notFound();

  return (
    <BrandShell
      guestName={c.guest_name}
      buildingCode={c.building_code}
      unitCode={c.unit_code}
      lang="en"
    >
      <OrderStatusView
        token={token}
        initialOrder={orderRes.data}
        lines={linesRes.data ?? []}
        graceSeconds={(bldRes.data as { cancellation_grace_seconds?: number } | null)?.cancellation_grace_seconds ?? 120}
      />
    </BrandShell>
  );
}
