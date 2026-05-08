import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationTemplate = 'full' | 'ops';

export type NotificationGroup = {
  id: string;
  label: string;
  template: NotificationTemplate;
  enabled: boolean;
  phones: string[];
};

export type WaNotificationSettings = {
  groups: NotificationGroup[];
};

export const DEFAULT_SETTINGS: WaNotificationSettings = {
  groups: [
    {
      id: 'admin_guestrel',
      label: 'Admin & Guest Relations',
      template: 'full',
      enabled: false,
      phones: [],
    },
    {
      id: 'operations',
      label: 'Operations',
      template: 'ops',
      enabled: false,
      phones: [],
    },
  ],
};

// ── Settings CRUD ─────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'wa_reservation_notifications';

export async function loadWaNotificationSettings(): Promise<WaNotificationSettings> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single();
  if (!data) return DEFAULT_SETTINGS;
  return (data.value as WaNotificationSettings) ?? DEFAULT_SETTINGS;
}

export async function saveWaNotificationSettings(
  settings: WaNotificationSettings,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('beithady_settings').upsert({
    key: SETTINGS_KEY,
    value: settings as unknown as Record<string, unknown>,
    description: 'WhatsApp notification targets for new confirmed reservations.',
    updated_at: new Date().toISOString(),
  });
}

// ── Message builders ──────────────────────────────────────────────────────────

function normalizeChannel(source: string | null): string {
  const raw = (source || '').toLowerCase();
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'Vrbo';
  if (raw.includes('expedia')) return 'Expedia';
  if (!raw || raw === 'manual' || raw.includes('direct')) return 'Direct';
  return source!.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return '—';
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return ymd; }
}

export type ReservationPayload = {
  confirmationCode: string | null;
  status: string | null;
  source: string | null;
  listingId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  nights: number | null;
  hostPayout: number | null;
  fareAccommodation: number | null;
  // Enriched after DB join
  buildingCode?: string | null;
  unitNickname?: string | null;
};

function buildMessage(template: NotificationTemplate, r: ReservationPayload): string {
  const channel   = normalizeChannel(r.source);
  const building  = r.buildingCode  ?? '—';
  const unit      = r.unitNickname  ?? r.listingId ?? '—';
  const guest     = r.guestName     ?? '—';
  const mobile    = r.guestPhone    ?? '—';
  const period    = `${fmtDate(r.checkInDate)} → ${fmtDate(r.checkOutDate)}`;
  const nights    = r.nights != null ? `${r.nights} night${r.nights === 1 ? '' : 's'}` : '—';

  const header = `🏠 *New Reservation*\n━━━━━━━━━━━━━━━\n`;
  const common =
    `📲 Channel: ${channel}\n` +
    `🏢 Building: ${building}\n` +
    `🛏️ Unit: ${unit}\n` +
    `👤 Guest: ${guest}\n` +
    `📱 Mobile: ${mobile}\n` +
    `📅 ${period}\n` +
    `🌙 ${nights}`;

  if (template === 'full') {
    const total    = r.hostPayout != null ? `$${r.hostPayout.toFixed(2)}` : '—';
    const rateBase = r.fareAccommodation ?? r.hostPayout;
    const rate     = rateBase != null && r.nights
      ? `$${(rateBase / r.nights).toFixed(2)}`
      : '—';
    return `${header}${common}\n💰 Total: ${total}\n📊 Rate/night: ${rate}`;
  }

  return `${header}${common}`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Called from the reservation webhook after a successful upsert.
 * Reads notification settings and sends WhatsApp to each enabled group.
 * Failures are logged but never throw — the webhook must still return 200.
 */
export async function notifyNewReservation(raw: ReservationPayload): Promise<void> {
  try {
    const settings = await loadWaNotificationSettings();
    const enabledGroups = settings.groups.filter(
      (g) => g.enabled && g.phones.length > 0,
    );
    if (enabledGroups.length === 0) return;

    // Enrich with listing info (building_code, nickname) via one DB query.
    const reservation: ReservationPayload = { ...raw };
    if (raw.listingId && (!raw.buildingCode || !raw.unitNickname)) {
      const sb = supabaseAdmin();
      const { data: listing } = await sb
        .from('guesty_listings')
        .select('building_code, nickname')
        .eq('id', raw.listingId)
        .single();
      if (listing) {
        reservation.buildingCode = listing.building_code ?? null;
        reservation.unitNickname = listing.nickname ?? null;
      }
    }

    await Promise.allSettled(
      enabledGroups.flatMap((group) =>
        group.phones.map((phone) => {
          const to = phone.replace(/^\+/, '').replace(/\D/g, '');
          const message = buildMessage(group.template, reservation);
          return sendWhatsApp({ to, message });
        }),
      ),
    );
  } catch (err) {
    console.error('[wa-reservation-notify] error:', err);
  }
}
