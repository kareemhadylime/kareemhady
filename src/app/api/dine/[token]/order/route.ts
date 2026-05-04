import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { computeCartTotals, computeLineTotal } from '@/lib/beithady/fnb/cart';
import { SubmitOrderPayloadSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) {
    return NextResponse.json({ error: c.reason }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  let parsed;
  try { parsed = SubmitOrderPayloadSchema.parse(body); }
  catch (e) {
    return NextResponse.json({ error: 'invalid_payload', detail: String(e) }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // 1. Idempotency: if key seen, return existing order
  const existing = await sb.from('fnb_orders')
    .select('*').eq('idempotency_key', parsed.idempotency_key).maybeSingle();
  if (existing.data) {
    return NextResponse.json({ order: existing.data });
  }

  // 2. Fetch items + modifiers + overrides for last-mile validation
  const itemIds = [...new Set(parsed.lines.map(l => l.item_id))];
  const modifierIds = [...new Set(parsed.lines.flatMap(l => l.modifier_ids))];
  const [itemsRes, modsRes, overridesRes] = await Promise.all([
    sb.from('fnb_items').select('*')
      .in('id', itemIds).eq('enabled', true).is('deleted_at', null),
    modifierIds.length > 0
      ? sb.from('fnb_item_modifiers').select('*')
        .in('id', modifierIds).eq('enabled', true)
      : Promise.resolve({ data: [], error: null } as any),
    sb.from('fnb_building_overrides').select('item_id')
      .eq('building_code', c.building_code).eq('is_out_of_stock', true)
      .in('item_id', itemIds),
  ]);
  if (itemsRes.error || modsRes.error || overridesRes.error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  const items = itemsRes.data ?? [];
  const mods = modsRes.data ?? [];
  const outOfStock = new Set((overridesRes.data ?? []).map(o => o.item_id));

  // 3. Validate every line + check hours
  const now = new Date();
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(now),
    10,
  );
  const cairoMinute = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', minute: 'numeric' }).format(now),
    10,
  );

  function inWindow(start: string, end: string): boolean {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const cur = cairoHour * 60 + cairoMinute;
    return cur >= sh * 60 + sm && cur <= eh * 60 + em;
  }

  // Pre-fetch categories for hours fallback
  const cats = await sb.from('fnb_categories').select('*').eq('enabled', true);
  const catMap = new Map(((cats.data ?? []) as any[]).map(c => [c.id, c]));

  const orderLines: Array<{
    item_id: string;
    item_name_snapshot: string;
    quantity: number;
    unit_price_usd_snapshot: number;
    modifier_snapshot: Array<{ id: string; name_en: string; name_localized: string; price_delta_usd: number }>;
    line_total_usd: number;
    notes: string | null;
  }> = [];

  for (const line of parsed.lines) {
    const item = items.find(i => i.id === line.item_id);
    if (!item) {
      return NextResponse.json({ error: 'item_unavailable', item_id: line.item_id }, { status: 409 });
    }
    if (outOfStock.has(item.id)) {
      return NextResponse.json({ error: 'item_out_of_stock', item_id: item.id }, { status: 409 });
    }
    const start = item.hours_start_override
      ?? catMap.get(item.category_id)?.hours_start
      ?? '08:00';
    const end = item.hours_end_override
      ?? catMap.get(item.category_id)?.hours_end
      ?? '23:59';
    if (!inWindow(start, end)) {
      return NextResponse.json({ error: 'item_out_of_hours', item_id: item.id }, { status: 409 });
    }
    const lineMods = line.modifier_ids.map(mid => {
      const m = mods.find((x: any) => x.id === mid && x.item_id === item.id);
      if (!m) throw new Error('modifier_not_for_item');
      return m;
    });
    const lineTotal = computeLineTotal({
      unit_price_usd: item.price_usd,
      quantity: line.quantity,
      modifiers: lineMods.map(m => ({ price_delta_usd: m.price_delta_usd })),
    });
    orderLines.push({
      item_id: item.id,
      item_name_snapshot: item[`name_${parsed.guest_language}`] ?? item.name_en,
      quantity: line.quantity,
      unit_price_usd_snapshot: item.price_usd,
      modifier_snapshot: lineMods.map(m => ({
        id: m.id,
        name_en: m.name_en,
        name_localized: m[`name_${parsed.guest_language}`] ?? m.name_en,
        price_delta_usd: m.price_delta_usd,
      })),
      line_total_usd: lineTotal,
      notes: line.notes ?? null,
    });
  }

  // 4. Compute totals server-side
  const totals = computeCartTotals(
    orderLines.map(l => ({
      unit_price_usd: l.unit_price_usd_snapshot,
      quantity: l.quantity,
      modifiers: l.modifier_snapshot.map(m => ({ price_delta_usd: m.price_delta_usd })),
    })),
  );

  // 5. SLA-based ETA
  const { data: bld } = await sb.from('fnb_buildings')
    .select('delivery_sla_minutes')
    .eq('building_code', c.building_code).single();
  const sla = (bld as { delivery_sla_minutes?: number } | null)?.delivery_sla_minutes ?? 30;
  const eta = parsed.requested_delivery_at
    ?? new Date(Date.now() + sla * 60_000).toISOString();

  // 6. Insert order + lines + first status event
  const { data: order, error: orderErr } = await sb.from('fnb_orders').insert({
    reservation_id: c.reservation_id,
    building_code: c.building_code,
    unit_code: c.unit_code,
    guest_name: c.guest_name,
    guest_language: parsed.guest_language,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    subtotal_usd: totals.subtotal_usd,
    vat_usd: totals.vat_usd,
    service_usd: totals.service_usd,
    total_usd: totals.total_usd,
    requested_delivery_at: parsed.requested_delivery_at,
    eta_at: eta,
    notes: parsed.notes ?? null,
    idempotency_key: parsed.idempotency_key,
  } as any).select().single();

  if (orderErr || !order) {
    // Idempotency unique violation: re-fetch and return
    if (orderErr?.code === '23505') {
      const re = await sb.from('fnb_orders').select('*')
        .eq('idempotency_key', parsed.idempotency_key).single();
      if (re.data) return NextResponse.json({ order: re.data });
    }
    return NextResponse.json(
      { error: 'insert_failed', detail: orderErr?.message },
      { status: 500 },
    );
  }

  await sb.from('fnb_order_items').insert(
    orderLines.map(l => ({ ...l, order_id: order.id } as any)),
  );

  await sb.from('fnb_status_events').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'submitted',
    changed_by_user_id: null,
    changed_via: 'guest',
    notes: 'Order submitted by guest',
  } as any);

  // 7. Fire WA push to kitchen — Phase F.5 wires this
  // TODO: T33 — notifyKitchen(order.id).catch(err => console.error('[fnb] notifyKitchen failed', err));

  return NextResponse.json({ order }, { status: 201 });
}
