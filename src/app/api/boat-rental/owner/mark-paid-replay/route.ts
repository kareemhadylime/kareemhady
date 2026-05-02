import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBoatRole, getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { recordPaymentCore } from '@/lib/boat-rental/record-payment';

// Background-sync replay endpoint for the offline owner Mark-Paid queue.
//
// Idempotency: the client sends a UUIDv4 'id' as the dedup key. The
// payments table has a partial unique index on idempotency_key (only
// where not null), so a second insert with the same key fails — at
// which point we return 409 to signal "already processed" and the
// queue removes the entry. After Phase 4 the actual insert + balance
// math + auto-flip is delegated to recordPaymentCore so this endpoint
// shares behavior with the synchronous server action.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Body = {
  id: string; // UUID idempotency key
  reservationId: string;
  amountEgp: number;
  method: string;
  note: string | null;
  paidDate?: string; // YYYY-MM-DD; defaults to today (Cairo) on server
};

function uuidShape(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function todayIso(): string {
  // Local-day fallback — owner clients enqueue at the moment they record.
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBoatRole(me, 'owner'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (
    !body ||
    !uuidShape(body.id) ||
    !body.reservationId ||
    !Number.isFinite(body.amountEgp) ||
    body.amountEgp <= 0
  ) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  // Authorize: owner must control the boat for this reservation. Done up front
  // so unauthorized callers can't probe the dedup table.
  const ownerIds = await getOwnedOwnerIds(me);
  if (!ownerIds.length) {
    return NextResponse.json({ error: 'no_owner_records' }, { status: 403 });
  }
  const sb = supabaseAdmin();
  const { data: resvRow } = await sb
    .from('boat_rental_reservations')
    .select('id, boat:boat_rental_boats ( owner_id )')
    .eq('id', body.reservationId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = resvRow as any;
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!ownerIds.includes(r.boat.owner_id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await recordPaymentCore({
    reservationId: body.reservationId,
    amountEgp: body.amountEgp,
    method: body.method || 'manual_override',
    paidDate: body.paidDate || todayIso(),
    note: body.note,
    recordedBy: me.id,
    recordedByRole: 'owner',
    idempotencyKey: body.id,
  });

  if (!result.ok) {
    if (result.reason === 'bad_status') {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    if (result.reason === 'not_found') {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.reason === 'overpayment') {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.deduped) {
    return NextResponse.json({ ok: true, deduped: true }, { status: 409 });
  }
  return NextResponse.json({ ok: true, auto_flipped: result.auto_flipped });
}
