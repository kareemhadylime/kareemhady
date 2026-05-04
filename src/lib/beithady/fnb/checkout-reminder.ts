import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export interface CheckoutReminderItem {
  reservation_id: string;
  guest_name: string | null;
  building_code: string;
  unit_code: string;
  unsettled_orders: number;
  unsettled_total_usd: number;
  checkout_at: string | null;
}

export async function listReservationsCheckingOutTodayWithUnsettled(
): Promise<CheckoutReminderItem[]> {
  const sb = supabaseAdmin();
  // Fetch all unsettled F&B orders.
  const { data: orders } = await sb.from('fnb_orders')
    .select('id, reservation_id, building_code, unit_code, guest_name, total_usd, status')
    .in('status', ['delivered', 'closed'])
    .is('guesty_charge_id', null);

  const grouped = new Map<string, CheckoutReminderItem>();
  for (const o of (orders ?? []) as Array<{
    reservation_id: string; building_code: string; unit_code: string;
    guest_name: string | null; total_usd: number | string;
  }>) {
    const cur = grouped.get(o.reservation_id) ?? {
      reservation_id: o.reservation_id,
      guest_name: o.guest_name,
      building_code: o.building_code,
      unit_code: o.unit_code,
      unsettled_orders: 0,
      unsettled_total_usd: 0,
      checkout_at: null,
    };
    cur.unsettled_orders += 1;
    cur.unsettled_total_usd += Number(o.total_usd);
    grouped.set(o.reservation_id, cur);
  }

  if (grouped.size === 0) return [];

  // Fetch checkout_at for each reservation from the DB mirror.
  // T20 found that `guesty_reservations` is the relevant table; use it.
  const reservationIds = [...grouped.keys()];
  const { data: reservations } = await sb.from('guesty_reservations')
    .select('id, check_out_at, check_out, end_date')
    .in('id', reservationIds);
  const resMap = new Map<string, { checkout_at: string | null }>();
  for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
    const id = String(r.id);
    const co = (r.check_out_at as string | null)
      ?? (r.check_out as string | null)
      ?? (r.end_date as string | null)
      ?? null;
    resMap.set(id, { checkout_at: co });
  }

  // Filter to checking out today (Cairo time).
  const todayCairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const out: CheckoutReminderItem[] = [];
  for (const item of grouped.values()) {
    const r = resMap.get(item.reservation_id);
    if (r?.checkout_at) {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })
        .format(new Date(r.checkout_at));
      item.checkout_at = r.checkout_at;
      if (day === todayCairo) out.push(item);
    } else {
      out.push(item);   // fail-open: include in reminders if checkout date unknown
    }
  }
  return out;
}
