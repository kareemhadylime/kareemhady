import 'server-only';
import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { ReceiptDoc } from '@/lib/beithady/fnb/receipt-pdf';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return new Response('forbidden', { status: 403 });

  const sb = supabaseAdmin();
  const [orderRes, linesRes, bldRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', orderId).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    sb.from('fnb_buildings').select('receipt_vat_line')
      .eq('building_code', c.building_code).single(),
  ]);
  const o = orderRes.data as { reservation_id: string; order_number: number } | null;
  if (!o || o.reservation_id !== c.reservation_id) {
    return new Response('not_found', { status: 404 });
  }

  const buffer = await renderToBuffer(
    ReceiptDoc({
      order: orderRes.data as never,
      lines: (linesRes.data ?? []) as never,
      vatLine: (bldRes.data as { receipt_vat_line?: string } | null)?.receipt_vat_line ?? null,
    }),
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bh-receipt-${o.order_number}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
