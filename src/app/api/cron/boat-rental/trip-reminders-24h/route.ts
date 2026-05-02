import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { getDefaultSkipper } from '@/lib/boat-rental/skipper-resolver';
import { logAudit, shortRef } from '@/lib/boat-rental/server-helpers';
import {
  enqueueNotification,
  flushPendingForReservation,
} from '@/lib/boat-rental/notifications';

// Hourly cron: send a 24h pre-trip reminder (Arabic by default) to the
// boat owner and the default skipper for each upcoming-tomorrow reservation
// that hasn't been reminded yet. Idempotent via reservations.reminder_24h_sent_at.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function addDaysCairo(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

type ReservationRow = {
  id: string;
  booking_date: string;
  notes: string | null;
  boat: { id: string; name: string; owner_id: string } | null;
  booking: {
    client_name: string | null;
    guest_count: number | null;
    trip_ready_time: string | null;
    destination: { name: string } | null;
  } | null;
};

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const tomorrow = addDaysCairo(cairoTodayStr(), 1);

  const { data: rowsRaw } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, notes,
      boat:boat_rental_boats ( id, name, owner_id ),
      booking:boat_rental_bookings (
        client_name, guest_count, trip_ready_time,
        destination:boat_rental_destinations ( name )
      )
    `
    )
    .in('status', ['confirmed', 'details_filled'])
    .is('reminder_24h_sent_at', null)
    .eq('booking_date', tomorrow);

  const rows = ((rowsRaw as unknown) as ReservationRow[] | null) ?? [];
  let sent = 0;
  let skipped = 0;

  for (const r of rows) {
    if (!r.boat) {
      skipped++;
      continue;
    }
    const ownerOwnerId = r.boat.owner_id;
    const [{ data: ownerRow }, { data: settingsRow }] = await Promise.all([
      sb
        .from('boat_rental_owners')
        .select('whatsapp, name')
        .eq('id', ownerOwnerId)
        .maybeSingle(),
      sb
        .from('boat_rental_owner_settings')
        .select('reminder_24h_lang, whatsapp')
        .eq('owner_id', ownerOwnerId)
        .maybeSingle(),
    ]);
    if (!ownerRow) {
      skipped++;
      continue;
    }
    const owner = ownerRow as { whatsapp: string | null; name: string };
    const settings = settingsRow as
      | { reminder_24h_lang: 'en' | 'ar'; whatsapp: string | null }
      | null;
    const ownerWhatsapp = settings?.whatsapp || owner.whatsapp || null;
    const lang: 'en' | 'ar' = settings?.reminder_24h_lang ?? 'ar';

    const skipper = await getDefaultSkipper(r.boat.id);

    const baseContext = {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      tripReadyTime: r.booking?.trip_ready_time ?? undefined,
      destinationName: r.booking?.destination?.name ?? null,
      clientName: r.booking?.client_name ?? undefined,
      guestCount: r.booking?.guest_count ?? undefined,
      skipperName: skipper?.name ?? '—',
      notes: r.notes,
      shortRef: shortRef(r.id),
    };

    if (ownerWhatsapp) {
      await enqueueNotification({
        reservationId: r.id,
        to: { phone: ownerWhatsapp, role: 'owner' },
        templateKey: 'trip_reminder_24h',
        language: lang,
        context: baseContext,
      });
    }
    if (skipper?.whatsapp) {
      await enqueueNotification({
        reservationId: r.id,
        to: { phone: skipper.whatsapp, role: 'skipper' },
        templateKey: 'trip_reminder_24h',
        language: 'ar',
        context: baseContext,
      });
    }

    // Flush this reservation's pending now so messages go out promptly.
    await flushPendingForReservation(r.id);

    await sb
      .from('boat_rental_reservations')
      .update({ reminder_24h_sent_at: new Date().toISOString() })
      .eq('id', r.id);

    await logAudit({
      reservationId: r.id,
      actorUserId: null,
      actorRole: 'system',
      action: 'trip_reminder_24h_sent',
      payload: {
        skipper_id: skipper?.id ?? null,
        owner_phone: Boolean(ownerWhatsapp),
        language: lang,
      },
    });

    sent++;
  }

  return NextResponse.json({ ok: true, tomorrow, sent, skipped, examined: rows.length });
}
