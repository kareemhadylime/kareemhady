import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { supabaseAdmin } from '@/lib/supabase';
import { ReceiptDoc } from './receipt-pdf';

// Green-API raw send — the only working WA path for bare phone numbers
// (T33 confirmed: sendWaCloudMessage / sendWaCasualMessage require a
// beithady_conversations.id and are not suitable here).
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
// Guesty conversation post — fallback when no WA number is available
import { sendGuestyConversationPost } from '@/lib/guesty';

export async function sendDeliveredReceipt(orderId: string): Promise<void> {
  const sb = supabaseAdmin();
  const [orderRes, linesRes, bldRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', orderId).single(),
    sb.from('fnb_order_items').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    sb.from('fnb_buildings').select('*'),
  ]);
  const order = orderRes.data as Record<string, unknown> & {
    id: string;
    order_number: number;
    reservation_id: string;
    building_code: string;
    total_usd: number | string;
  } | null;
  if (!order) return;

  const lines = (linesRes.data ?? []) as never[];
  const bld = ((bldRes.data ?? []) as Array<{ building_code: string; receipt_vat_line?: string | null }>)
    .find(b => b.building_code === order.building_code);

  // 1. Render PDF + persist to storage
  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      ReceiptDoc({
        order: order as never,
        lines,
        vatLine: bld?.receipt_vat_line ?? null,
      }),
    );
  } catch (e) {
    console.error('[fnb] receipt PDF render failed', e);
    return;
  }

  const path = `fnb-receipts/${orderId}.pdf`;
  const upload = await sb.storage
    .from('beithady-gallery')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (upload.error) {
    console.error('[fnb] receipt upload failed', upload.error);
    return;
  }

  const signed = await sb.storage
    .from('beithady-gallery')
    .createSignedUrl(path, 60 * 60 * 24 * 14); // 14 days
  const url = signed.data?.signedUrl ?? null;

  // 2. Resolve guest WhatsApp number via beithady_boarding_passes → beithady_guests
  const { data: bp } = await sb.from('beithady_boarding_passes')
    .select('guest_id').eq('reservation_id', order.reservation_id).maybeSingle();
  let guestWa: string | null = null;
  if (bp && (bp as { guest_id: string }).guest_id) {
    const { data: g } = await sb.from('beithady_guests')
      .select('phone_e164').eq('id', (bp as { guest_id: string }).guest_id).maybeSingle();
    guestWa = (g as { phone_e164?: string | null } | null)?.phone_e164 ?? null;
  }

  const shortBody = `Your Beit Hady F&B order #${String(order.order_number).padStart(4, '0')} has been delivered.\nTotal: $${Number(order.total_usd).toFixed(2)}.\nCharged to your room.`;

  let sentVia: 'wa_cloud' | 'wa_casual' | 'guesty' | 'failed' = 'failed';

  // 3a. WA Cloud — stub until WABA is provisioned; skip directly to Green-API.
  // 3b. WA Casual (Green-API) — T33's confirmed working path for bare phone numbers.
  if (guestWa) {
    try {
      const r = await sendWhatsApp({
        to: guestWa,
        // Include the signed URL as a plain-text link (Green-API doesn't
        // support media attachments without a separate file-upload step).
        message: url ? `${shortBody}\n\nReceipt: ${url}` : shortBody,
      });
      if (r.ok) sentVia = 'wa_casual';
    } catch (e) {
      console.error('[fnb] wa casual send failed', e);
    }
  }

  // 3c. Guesty conversation fallback — reaches the guest via whatever channel
  //     they used to book (WA, Airbnb inbox, email) without needing a phone number.
  if (sentVia === 'failed') {
    try {
      const { data: conv } = await sb.from('beithady_conversations')
        .select('external_id')
        .eq('reservation_id', order.reservation_id)
        .eq('channel', 'guesty')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conv && (conv as { external_id: string }).external_id) {
        const r = await sendGuestyConversationPost({
          conversationId: (conv as { external_id: string }).external_id,
          body: url ? `${shortBody}\n\nReceipt: ${url}` : shortBody,
          module: 'whatsapp',
        });
        if (r.ok) sentVia = 'guesty';
      }
    } catch (e) {
      console.error('[fnb] guesty fallback send failed', e);
    }
  }

  // 4. Persist trail in fnb_orders
  await sb.from('fnb_orders').update({
    receipt_pdf_path: path,
    receipt_sent_at: new Date().toISOString(),
    receipt_sent_via: sentVia,
  } as never).eq('id', orderId);
}
