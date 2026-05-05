import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { recordAudit } from '@/lib/beithady/audit';
import { validateDineToken } from './token-validate';

// "Always send the Menu App access details by Guest Recorded WhatsApp number."
//
// This module fires a WhatsApp message containing the guest's /dine/[token]
// URL to the phone recorded on beithady_guests for the boarding pass. It's
// idempotent per boarding pass (menu_link_sent_at column on
// beithady_boarding_passes), so the cron at /api/cron/fnb-send-menu-link can
// run on a tight schedule without spamming.
//
// Eligibility for an automatic send:
//   1. boarding pass exists and not expired
//   2. reservation status == 'checked_in'  (validateDineToken enforces)
//   3. building has fnb_buildings.enabled == true (validateDineToken enforces)
//   4. guest has phone_e164 recorded
//   5. menu_link_sent_at IS NULL  (idempotency)
//
// For ad-hoc operator triggers (e.g. "guest didn't see the WA, send again"),
// the cron route also accepts ?token=...&resend=1 to bypass the idempotency
// gate.

const PUBLIC_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://limeinc.vercel.app';

type Lang = 'en' | 'ar' | 'ru' | 'fr';

type MessageVars = {
  first_name: string;
  unit_code: string;
  building_code: string;
  dine_url: string;
  sla_minutes: number;
};

const RENDERERS: Record<Lang, (v: MessageVars) => string> = {
  en: (v) =>
`Hi ${v.first_name} 👋

Welcome to Beit Hady · ${v.unit_code}.

🍽️ In-Room Dining is now open. Tap below to browse the menu and order from your phone — we deliver to your apartment in ~${v.sla_minutes} min.

${v.dine_url}

Reply here if you need anything.`,
  ar: (v) =>
`أهلاً ${v.first_name} 👋

مرحباً بك في بيت هادي · ${v.unit_code}.

🍽️ خدمة الطعام في الغرفة متاحة الآن. اضغط على الرابط لتصفح القائمة والطلب من هاتفك — سنوصل إلى شقتك خلال ${v.sla_minutes} دقيقة تقريباً.

${v.dine_url}

نحن هنا إذا احتجت أي شيء.`,
  ru: (v) =>
`Здравствуйте, ${v.first_name} 👋

Добро пожаловать в Beit Hady · ${v.unit_code}.

🍽️ Заказ еды в номер уже доступен. Откройте меню на телефоне и сделайте заказ — мы доставим в вашу квартиру за ~${v.sla_minutes} мин.

${v.dine_url}

Напишите нам, если что-то понадобится.`,
  fr: (v) =>
`Bonjour ${v.first_name} 👋

Bienvenue à Beit Hady · ${v.unit_code}.

🍽️ Le room service est maintenant disponible. Ouvrez le menu sur votre téléphone et commandez — livraison à votre appartement en ~${v.sla_minutes} min.

${v.dine_url}

Répondez ici si vous avez besoin de quoi que ce soit.`,
};

export type SendMenuLinkResult =
  | {
      ok: true;
      provider_message_id: string;
      phone_e164_last4: string;
      dine_url: string;
      lang: Lang;
      building_code: string;
      unit_code: string;
    }
  | {
      ok: false;
      reason:
        | 'token_not_found'
        | 'reservation_not_found'
        | 'reservation_not_checked_in'
        | 'building_disabled'
        | 'building_not_egypt'
        | 'guest_wa_missing'
        | 'wa_send_failed'
        | 'already_sent';
      detail?: string;
    };

export type SendMenuLinkOptions = {
  // When true, bypass the menu_link_sent_at idempotency gate. Used by ops
  // to re-send if the guest reports they never saw the message.
  resend?: boolean;
};

export async function sendMenuLinkToGuest(
  token: string,
  opts: SendMenuLinkOptions = {},
): Promise<SendMenuLinkResult> {
  const ctx = await validateDineToken(token);
  if (!ctx.ok) {
    return { ok: false, reason: ctx.reason };
  }
  if (!ctx.guest_wa) {
    return { ok: false, reason: 'guest_wa_missing' };
  }

  const sb = supabaseAdmin();

  // Idempotency: skip if already sent (unless resend=true).
  if (!opts.resend) {
    const { data: bp } = await sb
      .from('beithady_boarding_passes')
      .select('menu_link_sent_at')
      .eq('token', token)
      .maybeSingle();
    const sentAt = (bp as { menu_link_sent_at: string | null } | null)?.menu_link_sent_at;
    if (sentAt) {
      return { ok: false, reason: 'already_sent', detail: sentAt };
    }
  }

  // Pull SLA from fnb_buildings — same row that validateDineToken already
  // confirmed is enabled. If row is missing somehow, fall back to 30.
  const { data: bld } = await sb
    .from('fnb_buildings')
    .select('delivery_sla_minutes')
    .eq('building_code', ctx.building_code)
    .maybeSingle();
  const slaMinutes =
    (bld as { delivery_sla_minutes: number | null } | null)?.delivery_sla_minutes ?? 30;

  const dineUrl = `${PUBLIC_BASE}/dine/${token}`;
  const firstName = (ctx.guest_name || 'there').split(' ')[0];
  const renderer = RENDERERS[ctx.guest_language] || RENDERERS.en;
  const body = renderer({
    first_name: firstName,
    unit_code: ctx.unit_code,
    building_code: ctx.building_code,
    dine_url: dineUrl,
    sla_minutes: slaMinutes,
  });

  const result = await sendWhatsApp({ to: ctx.guest_wa, message: body });

  const phoneLast4 = ctx.guest_wa.replace(/[^0-9]/g, '').slice(-4);

  if (!result.ok) {
    await recordAudit({
      module: 'fnb',
      action: 'menu_link_send_failed',
      target_type: 'boarding_pass',
      target_id: token,
      metadata: {
        phone_e164_last4: phoneLast4,
        building_code: ctx.building_code,
        unit_code: ctx.unit_code,
        lang: ctx.guest_language,
        error: result.error,
        disabled: result.disabled ?? false,
      },
    });
    return { ok: false, reason: 'wa_send_failed', detail: result.error };
  }

  // Persist idempotency stamp + provider id.
  await sb
    .from('beithady_boarding_passes')
    .update({
      menu_link_sent_at: new Date().toISOString(),
      menu_link_message_id: result.providerMessageId,
    })
    .eq('token', token);

  await recordAudit({
    module: 'fnb',
    action: 'menu_link_sent',
    target_type: 'boarding_pass',
    target_id: token,
    metadata: {
      phone_e164_last4: phoneLast4,
      building_code: ctx.building_code,
      unit_code: ctx.unit_code,
      lang: ctx.guest_language,
      provider_message_id: result.providerMessageId,
      dine_url: dineUrl,
      resend: !!opts.resend,
    },
  });

  return {
    ok: true,
    provider_message_id: result.providerMessageId,
    phone_e164_last4: phoneLast4,
    dine_url: dineUrl,
    lang: ctx.guest_language,
    building_code: ctx.building_code,
    unit_code: ctx.unit_code,
  };
}

// Batch mode: poll all eligible boarding passes and fire menu links.
// Used by the cron (every N minutes). Eligibility = validateDineToken passes
// + menu_link_sent_at IS NULL. The token-validate gate is the source of
// truth for "is the guest actually checked in at an F&B-enabled building" —
// we do a quick pre-filter on menu_link_sent_at + expires_at to keep the
// query small, then validateDineToken does the rest in the loop.
export type BatchSendResult = {
  considered: number;
  sent: number;
  skipped: number;
  errors: Array<{ token: string; reason: string; detail?: string }>;
};

export async function sendMenuLinksToEligibleGuests(): Promise<BatchSendResult> {
  const sb = supabaseAdmin();
  const { data: candidates } = await sb
    .from('beithady_boarding_passes')
    .select('token, expires_at')
    .is('menu_link_sent_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(200);

  const rows = (candidates as Array<{ token: string; expires_at: string }> | null) || [];

  let sent = 0;
  let skipped = 0;
  const errors: BatchSendResult['errors'] = [];

  for (const row of rows) {
    const r = await sendMenuLinkToGuest(row.token);
    if (r.ok) {
      sent++;
    } else if (
      r.reason === 'reservation_not_checked_in' ||
      r.reason === 'building_disabled' ||
      r.reason === 'building_not_egypt' ||
      r.reason === 'guest_wa_missing' ||
      r.reason === 'already_sent'
    ) {
      // Not an error — guest just isn't eligible right now (will be picked
      // up on a later tick once they check in / building is enabled / etc).
      skipped++;
    } else {
      errors.push({ token: row.token, reason: r.reason, detail: r.detail });
    }
  }

  await recordAudit({
    module: 'fnb',
    action: 'menu_link_batch_run',
    metadata: {
      considered: rows.length,
      sent,
      skipped,
      error_count: errors.length,
    },
  });

  return { considered: rows.length, sent, skipped, errors };
}
