import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
// Green-API raw send: { to: string (digits E.164 no +), message: string }
// Returns { ok: true, providerMessageId } | { ok: false, error, disabled? }
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
// Guesty conversation post — takes the Guesty conversation external_id
import { sendGuestyConversationPost } from '@/lib/guesty';

// NOTE on the "3-tier Cloud → Casual → Guesty" spec:
// sendWaCloudMessage and sendWaCasualMessage in
// src/lib/beithady/communication/ are full conversation wrappers that
// require a beithady_conversations.id — they don't accept a bare phone
// number and are not suitable for kitchen alerts sent to operator phones
// that may not have a conversation record.
//
// For kitchen alerts the correct raw primitive is sendWhatsApp (Green-API),
// which accepts any E.164 phone number.  When WABA is provisioned the spec's
// "Cloud" tier can be wired to a direct Meta Graph API call; until then this
// uses Green-API for both recipient attempts (single channel, multiple phones).
//
// For guest status notifications: we look up the Guesty conversation for the
// reservation and post there — this reaches whatever channel the guest used
// to book (WA, Airbnb inbox, email, etc.) without needing to know the
// phone number.

export interface NotifyResult {
  attempted: number;
  delivered: number;
  via: Array<'wa_cloud' | 'wa_casual' | 'guesty' | 'failed'>;
}

const DEFAULT_KITCHEN_TEMPLATE = (vars: {
  order_id: string;
  building_code: string;
  unit_code: string;
  guest_name: string | null;
  items_summary: string;
  total: string;
  delivery_time: string;
  dashboard_link: string;
}) =>
  `🍽️ New F&B order #${vars.order_id}
${vars.building_code} · Unit ${vars.unit_code}${vars.guest_name ? ` · ${vars.guest_name}` : ''}
─────
${vars.items_summary}
─────
Total $${vars.total} · Delivery ${vars.delivery_time}
Open: ${vars.dashboard_link}`;

export async function notifyKitchen(orderId: string): Promise<NotifyResult> {
  const sb = supabaseAdmin();

  const { data: order } = await sb
    .from('fnb_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (!order) return { attempted: 0, delivered: 0, via: [] };
  const o = order as Record<string, unknown>;

  const { data: lines } = await sb
    .from('fnb_order_items')
    .select('*')
    .eq('order_id', orderId);

  const { data: bld } = await sb
    .from('fnb_buildings')
    .select('*')
    .eq('building_code', o.building_code as string)
    .single();
  const b = bld as Record<string, unknown> | null;

  const recipients = (b?.kitchen_wa_recipients as string[] | null) ?? [];
  if (!recipients.length) {
    return { attempted: 0, delivered: 0, via: ['failed'] };
  }

  const items_summary = ((lines ?? []) as Array<Record<string, unknown>>)
    .map(l => `${l.quantity}× ${l.item_name_snapshot}`)
    .join('\n');

  const dashboard_link = `https://limeinc.vercel.app/beithady/fnb?id=${o.id as string}`;

  const delivery_time = o.requested_delivery_at
    ? new Date(o.requested_delivery_at as string).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Cairo',
      })
    : `ASAP (~${(b?.delivery_sla_minutes as number | null) ?? 30} min)`;

  const body = DEFAULT_KITCHEN_TEMPLATE({
    order_id: String(o.order_number).padStart(4, '0'),
    building_code: o.building_code as string,
    unit_code: o.unit_code as string,
    guest_name: (o.guest_name as string | null) ?? null,
    items_summary,
    total: Number(o.total_usd).toFixed(2),
    delivery_time,
    dashboard_link,
  });

  let attempted = 0;
  let delivered = 0;
  const via: NotifyResult['via'] = [];

  for (const recipient of recipients) {
    attempted++;
    // Green-API: primary send attempt (spec "Cloud" tier until WABA is live)
    try {
      const r = await sendWhatsApp({ to: recipient, message: body });
      if (r?.ok) {
        delivered++;
        // Report as wa_casual (Green-API) — update to wa_cloud when WABA lands
        via.push('wa_casual');
        continue;
      }
    } catch {
      /* fall through */
    }
    // If disabled or errored, record failure for this recipient
    via.push('failed');
  }

  return { attempted, delivered, via };
}

// Status messages in the 4 supported guest languages
const STATUS_MESSAGES: Record<string, Record<string, string>> = {
  en: {
    preparing: 'Your Beit Hady F&B order is being prepared.',
    ready: 'Your order is ready and on its way.',
    delivered: 'Your order has been delivered. Receipt will follow shortly.',
  },
  ar: {
    preparing: 'يتم تحضير طلبك من بيت هادي.',
    ready: 'طلبك جاهز وفي الطريق إليك.',
    delivered: 'تم تسليم طلبك. سيتم إرسال الفاتورة قريباً.',
  },
  ru: {
    preparing: 'Ваш заказ Beit Hady готовится.',
    ready: 'Ваш заказ готов и уже в пути.',
    delivered: 'Ваш заказ доставлен. Чек будет отправлен в ближайшее время.',
  },
  fr: {
    preparing: 'Votre commande Beit Hady est en préparation.',
    ready: 'Votre commande est prête et arrive.',
    delivered: 'Votre commande a été livrée. Le reçu suivra sous peu.',
  },
};

export async function notifyGuestStatus(
  orderId: string,
  newStatus: 'preparing' | 'ready' | 'delivered',
): Promise<NotifyResult> {
  const sb = supabaseAdmin();

  const { data: order } = await sb
    .from('fnb_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (!order) return { attempted: 0, delivered: 0, via: [] };
  const o = order as Record<string, unknown>;

  const lang = (o.guest_language as string | null) ?? 'en';
  const body =
    STATUS_MESSAGES[lang]?.[newStatus] ?? STATUS_MESSAGES.en[newStatus];

  // Look up the Guesty conversation for this reservation so we can post
  // directly to the thread the guest is already using (WA, Airbnb inbox,
  // email, etc.) without needing to store the guest's phone number.
  const reservationId = o.reservation_id as string | null;
  if (!reservationId) {
    return { attempted: 1, delivered: 0, via: ['failed'] };
  }

  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('external_id')
    .eq('reservation_id', reservationId)
    .eq('channel', 'guesty')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const guestyConversationId = (conv as { external_id: string } | null)
    ?.external_id;

  if (!guestyConversationId) {
    // No conversation synced yet — not a hard error, just no-op
    console.warn(
      `[fnb] notifyGuestStatus: no guesty conversation for reservation ${reservationId}`,
    );
    return { attempted: 1, delivered: 0, via: ['failed'] };
  }

  try {
    const r = await sendGuestyConversationPost({
      conversationId: guestyConversationId,
      body,
      module: 'whatsapp',
    });
    if (r.ok) {
      return { attempted: 1, delivered: 1, via: ['guesty'] };
    }
    return { attempted: 1, delivered: 0, via: ['failed'] };
  } catch {
    return { attempted: 1, delivered: 0, via: ['failed'] };
  }
}
