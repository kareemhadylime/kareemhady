import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { isAutomationPaused } from '@/lib/beithady/automations';
import { CANONICAL_BOOKED_STATUSES } from '@/lib/beithady/guesty-metrics';
import { isExcludedFromReport } from '@/lib/beithady-daily-report/units';

// Same-day-booking WhatsApp alerts. Fires from the
// /api/cron/beithady-same-day-alerts route every 15 min between
// 09:00 and 21:00 Cairo. Detects reservations that were CREATED today
// after 09:00 Cairo with check_in_date = today, and broadcasts a
// WhatsApp notification to GR + Ops + admin recipients so the unit can
// be prepped and a welcome message sent before the guest arrives.
//
// Idempotent via beithady_same_day_alerts (PRIMARY KEY on
// reservation_id). Concurrent ticks racing to send hit the unique
// constraint and skip cleanly.
//
// Honors the BH-DXB Egypt-only exclusion (per the standing rule from
// 2026-04-30) so we don't notify for UAE bookings the rest of the
// product treats as out-of-scope.

const ALERT_ROLES = ['guest_relations', 'ops', 'manager', 'admin'] as const;

export type SameDayAlertRunResult = {
  ok: boolean;
  cairo_date: string;
  detected: number;
  alerted: number;
  skipped_already_alerted: number;
  skipped_excluded: number;
  delivered_whatsapp: number;
  failed: number;
  errors: Array<{ reservation_id: string; recipient?: string; error: string }>;
  duration_ms: number;
  paused?: boolean;
};

type GuestyResRow = {
  id: string;
  confirmation_code: string | null;
  status: string | null;
  source: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  guests: number | null;
  created_at_odoo: string | null;
  listing: { building_code: string | null } | null;
};

/**
 * Returns the UTC ISO timestamp corresponding to `ymd 09:00:00` in Cairo
 * local time. DST-safe (mirrors the morning-brief helpers).
 */
function cairoNineAmUtcIso(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  // We want the UTC instant that, when displayed in Africa/Cairo, reads 09:00.
  // Probe with a candidate UTC time of `ymd 09:00:00 UTC`, then ask Intl
  // what the Cairo offset for that instant is, and shift accordingly.
  const candidateUtc = Date.UTC(y, m - 1, d, 9, 0, 0);
  const cairoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(candidateUtc));
  const lookup = Object.fromEntries(cairoParts.map((p) => [p.type, p.value]));
  const cairoAsUtcMs = Date.UTC(
    parseInt(lookup.year, 10),
    parseInt(lookup.month, 10) - 1,
    parseInt(lookup.day, 10),
    parseInt((lookup.hour === '24' ? '0' : lookup.hour) || '0', 10),
    parseInt(lookup.minute || '0', 10),
    parseInt(lookup.second || '0', 10),
  );
  // offset = cairoAsUtcMs - candidateUtc.  cairo offset in summer = +3h (10800000)
  const offsetMs = cairoAsUtcMs - candidateUtc;
  return new Date(candidateUtc - offsetMs).toISOString();
}

/**
 * Resolve the deduplicated WhatsApp recipient list for same-day alerts.
 * Same source-of-truth as the morning brief (`beithady_user_roles`),
 * unioning GR + Ops + admins/managers so the alert lands with everyone
 * who needs to act. Admin role is auto-included so kareem doesn't need a
 * dedicated entry.
 *
 * `beithady_morning_brief_extras` is also consulted for both `guest_relations`
 * and `ops` rows so admin-curated overrides (e.g. external WhatsApp groups)
 * propagate without a code change.
 */
async function loadAlertRecipients(): Promise<
  Array<{ label: string; whatsapp: string }>
> {
  const sb = supabaseAdmin();
  const out: Array<{ label: string; whatsapp: string }> = [];
  const seenWhatsApp = new Set<string>();

  // 1. Auto-broadcast: users in any of the alert roles (GR/Ops/manager/admin)
  const { data: roleRows } = await sb
    .from('beithady_user_roles')
    .select('user_id')
    .in('role', ALERT_ROLES as unknown as string[]);
  const userIds = Array.from(
    new Set(((roleRows as Array<{ user_id: string }> | null) || []).map((r) => r.user_id)),
  );
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from('app_users')
      .select('id, username, whatsapp')
      .in('id', userIds);
    for (const u of (users as Array<{ id: string; username: string | null; whatsapp: string | null }> | null) || []) {
      const wa = u.whatsapp ? u.whatsapp.replace(/[^0-9]/g, '') : null;
      if (!wa || seenWhatsApp.has(wa)) continue;
      seenWhatsApp.add(wa);
      out.push({ label: u.username || u.id.slice(0, 8), whatsapp: wa });
    }
  }

  // 2. Admin-curated extras for GR + Ops (reuse the morning-brief table —
  //    one source of truth for human additions)
  const { data: extras } = await sb
    .from('beithady_morning_brief_extras')
    .select('id, label, whatsapp, role, enabled')
    .in('role', ['guest_relations', 'ops'])
    .eq('enabled', true);
  for (const e of (extras as Array<{ id: string; label: string; whatsapp: string | null; role: string; enabled: boolean }> | null) || []) {
    const wa = e.whatsapp ? e.whatsapp.replace(/[^0-9]/g, '') : null;
    if (!wa || seenWhatsApp.has(wa)) continue;
    seenWhatsApp.add(wa);
    out.push({ label: e.label, whatsapp: wa });
  }

  return out;
}

function normalizeChannel(source: string | null): string {
  const raw = (source || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'Vrbo';
  if (raw.includes('expedia')) return 'Expedia';
  if (raw === 'manual' || raw.includes('direct') || raw.includes('website')) return 'Direct';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCairoTime(iso: string | null): string {
  if (!iso) return 'just now';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso)) + ' Cairo';
  } catch {
    return 'just now';
  }
}

function buildAlertMessage(r: GuestyResRow): string {
  const channel = normalizeChannel(r.source);
  const guests = r.guests != null && r.guests > 0 ? `${r.guests} guest${r.guests === 1 ? '' : 's'}` : null;
  const nights = r.nights != null && r.nights > 0 ? `${r.nights} night${r.nights === 1 ? '' : 's'}` : null;
  const stayMeta = [guests, nights].filter(Boolean).join(' · ');
  const unit = r.listing_nickname || r.listing?.building_code || 'unit TBD';
  const guestName = r.guest_name || 'Guest';
  const code = r.confirmation_code || r.id.slice(-6);
  const bookedAt = fmtCairoTime(r.created_at_odoo);

  return [
    `🆕 *Same-day booking · ${unit}*`,
    `${channel} · booked ${bookedAt}`,
    ``,
    `Guest: ${guestName}${stayMeta ? ` · ${stayMeta}` : ''}`,
    `Code: ${code}`,
    `Check-in: today (${r.check_in_date})`,
    ``,
    `_Action: prep unit + send welcome message_`,
  ].join('\n');
}

export async function runSameDayAlerts(opts: { cairoDate: string; dryRun?: boolean }): Promise<SameDayAlertRunResult> {
  const t0 = Date.now();
  const sb = supabaseAdmin();
  const today = opts.cairoDate;

  // Granular kill-switch — same pattern as morning-brief WA distribution.
  const paused = await isAutomationPaused('same_day_alerts');
  if (paused) {
    return {
      ok: true,
      cairo_date: today,
      detected: 0,
      alerted: 0,
      skipped_already_alerted: 0,
      skipped_excluded: 0,
      delivered_whatsapp: 0,
      failed: 0,
      errors: [],
      duration_ms: Date.now() - t0,
      paused: true,
    };
  }

  const cutoffUtc = cairoNineAmUtcIso(today);

  // Pull candidate reservations: created today after 09:00 Cairo, check-in today,
  // active status. Honor the Egypt-only exclusion via the listing join + a
  // post-filter (a SQL-level filter on building_code can miss listings whose
  // BH-DXB tag lives only in tags or a related table — the predicate is the
  // canonical answer).
  const { data: reservations, error: resErr } = await sb
    .from('guesty_reservations')
    .select(
      `id, confirmation_code, status, source, listing_id, listing_nickname,
       guest_name, check_in_date, check_out_date, nights, guests,
       created_at_odoo,
       listing:guesty_listings!left(building_code)`,
    )
    .gte('created_at_odoo', cutoffUtc)
    .eq('check_in_date', today)
    .in('status', CANONICAL_BOOKED_STATUSES as unknown as string[])
    .order('created_at_odoo', { ascending: true })
    .limit(50);
  if (resErr) {
    return {
      ok: false,
      cairo_date: today,
      detected: 0,
      alerted: 0,
      skipped_already_alerted: 0,
      skipped_excluded: 0,
      delivered_whatsapp: 0,
      failed: 0,
      errors: [{ reservation_id: '-', error: `query: ${resErr.message}` }],
      duration_ms: Date.now() - t0,
    };
  }

  const allRows = (reservations as Array<Record<string, unknown>> | null) || [];
  const candidates: GuestyResRow[] = [];
  let skippedExcluded = 0;
  for (const raw of allRows) {
    const r = raw as unknown as GuestyResRow;
    if (isExcludedFromReport(r.listing?.building_code ?? null)) {
      skippedExcluded += 1;
      continue;
    }
    candidates.push(r);
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      cairo_date: today,
      detected: 0,
      alerted: 0,
      skipped_already_alerted: 0,
      skipped_excluded: skippedExcluded,
      delivered_whatsapp: 0,
      failed: 0,
      errors: [],
      duration_ms: Date.now() - t0,
    };
  }

  // De-dup against the alert log
  const candidateIds = candidates.map((r) => r.id);
  const { data: alertedRows } = await sb
    .from('beithady_same_day_alerts')
    .select('reservation_id')
    .in('reservation_id', candidateIds);
  const alreadyAlerted = new Set(
    ((alertedRows as Array<{ reservation_id: string }> | null) || []).map((r) => r.reservation_id),
  );

  const fresh = candidates.filter((r) => !alreadyAlerted.has(r.id));

  if (fresh.length === 0) {
    return {
      ok: true,
      cairo_date: today,
      detected: candidates.length,
      alerted: 0,
      skipped_already_alerted: candidates.length,
      skipped_excluded: skippedExcluded,
      delivered_whatsapp: 0,
      failed: 0,
      errors: [],
      duration_ms: Date.now() - t0,
    };
  }

  const recipients = await loadAlertRecipients();

  let alerted = 0;
  let deliveredWa = 0;
  let failed = 0;
  const errors: Array<{ reservation_id: string; recipient?: string; error: string }> = [];

  for (const r of fresh) {
    const message = buildAlertMessage(r);

    // Lock the row first via INSERT (idempotent — if another tick beat us
    // here, the INSERT errors with 23505 and we skip the send).
    if (!opts.dryRun) {
      const { error: insErr } = await sb
        .from('beithady_same_day_alerts')
        .insert({
          reservation_id: r.id,
          recipients_count: recipients.length,
          message_text: message,
        });
      if (insErr) {
        // Most likely a 23505 — concurrent tick already alerted; treat as no-op.
        continue;
      }
    }

    let perResDelivered = 0;
    let perResFailed = 0;
    const perResErrors: Array<{ recipient: string; error: string }> = [];
    for (const rcp of recipients) {
      if (opts.dryRun) {
        perResDelivered += 1;
        continue;
      }
      const result = await sendWhatsApp({ to: rcp.whatsapp, message });
      if (result.ok) {
        perResDelivered += 1;
      } else {
        perResFailed += 1;
        perResErrors.push({ recipient: rcp.label, error: result.error });
        errors.push({ reservation_id: r.id, recipient: rcp.label, error: result.error });
      }
    }

    deliveredWa += perResDelivered;
    failed += perResFailed;
    alerted += 1;

    // Update the alert log with delivery counts so /beithady/setup can show
    // the run's outcome at a glance (similar to daily-report deliveries).
    if (!opts.dryRun) {
      await sb
        .from('beithady_same_day_alerts')
        .update({
          delivered_count: perResDelivered,
          failed_count: perResFailed,
          errors: perResErrors.length > 0 ? perResErrors : null,
        })
        .eq('reservation_id', r.id);
    }
  }

  return {
    ok: true,
    cairo_date: today,
    detected: candidates.length,
    alerted,
    skipped_already_alerted: candidates.length - fresh.length,
    skipped_excluded: skippedExcluded,
    delivered_whatsapp: deliveredWa,
    failed,
    errors,
    duration_ms: Date.now() - t0,
  };
}
