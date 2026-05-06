import 'server-only';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderDetail } from './_components/order-detail';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export default async function OrderDetailPage({ params }: Ctx) {
  const { roles } = await requireBeithadyPermission('fnb', 'read');
  const { id } = await params;
  const sb = supabaseAdmin();
  const [orderRes, linesRes, eventsRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', id).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', id),
    sb.from('fnb_status_events').select('*').eq('order_id', id)
      .order('at', { ascending: true }),
  ]);
  if (!orderRes.data) notFound();
  const canCancel = roles.some(r => ['admin', 'manager', 'fnb_manager'].includes(r));
  return (
    <OrderDetail
      order={orderRes.data}
      lines={linesRes.data ?? []}
      events={eventsRes.data ?? []}
      canCancel={canCancel}
    />
  );
}
