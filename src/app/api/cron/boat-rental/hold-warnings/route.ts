import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';
import { shortRef } from '@/lib/boat-rental/server-helpers';

// Pushes a "hold expires in ~30 minutes" WhatsApp warning. A held
// reservation gets at most one warning (tracked via hold_warning_sent_at).
//
// Runs every 5 minutes from the cron. Picks up holds whose held_until
// falls within the next 35 minutes and haven't been warned yet.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const now = Date.now();
  const cutoff = new Date(now + 35 * 60 * 1000).toISOString(); // up to 35 min from now
  const floor = new Date(now + 25 * 60 * 1000).toISOString();  // not earlier than 25 min from now

  const { data } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, held_until, broker_id, price_egp_snapshot,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( id, whatsapp, user_id ) ),
      broker:app_users!boat_rental_reservations_broker_id_fkey ( id, username )
    `
    )
    .eq('status', 'held')
    .is('hold_warning_sent_at', null)
    .gte('held_until', floor)
    .lte('held_until', cutoff)
    .limit(100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[] | null) || [];
  if (!rows.length) return NextResponse.json({ ok: true, warned: 0 });

  let sent = 0;
  for (const r of rows) {
    const expiresAt = r.held_until ? new Date(r.held_until).toLocaleTimeString() : 'soon';
    // We don't have broker phone in app_users today — skip phone, the
    // notification still records into boat_rental_notifications for admin
    // visibility even if we can't deliver via Green-API.
    await enqueueNotification({
      reservationId: r.id,
      to: { userId: r.broker_id, phone: '', role: 'broker' },
      templateKey: 'hold_warning',
      language: 'en',
      context: {
        boatName: r.boat?.name || '',
        bookingDate: r.booking_date,
        shortRef: shortRef(r.id),
        expiresAt,
      },
    });
    await sb
      .from('boat_rental_reservations')
      .update({ hold_warning_sent_at: new Date().toISOString() })
      .eq('id', r.id);
    await flushPendingForReservation(r.id);
    sent++;
  }
  return NextResponse.json({ ok: true, warned: sent });
}
