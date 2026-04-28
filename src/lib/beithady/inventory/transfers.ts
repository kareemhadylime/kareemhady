import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type TransferRow = {
  transfer_id: string;
  posted_at: string;
  src_warehouse_id: string;
  src_warehouse_code: string;
  src_warehouse_name: string;
  dst_warehouse_id: string;
  dst_warehouse_code: string;
  dst_warehouse_name: string;
  line_count: number;
  total_value_egp: number;
  total_qty: number;
  created_by_user: string | null;
  first_note: string | null;
};

export type TransferLine = {
  doc_line_no: number | null;
  item_id: string;
  item_sku: string;
  item_name_en: string;
  item_uom: string;
  qty: number;
  batch_no: string;
  unit_cost_egp: number;
};

export type TransferDetail = TransferRow & {
  lines: TransferLine[];
};

// List recent transfers by aggregating transfer_out transactions per doc_id.
export async function listTransfers(opts: { limit?: number } = {}): Promise<TransferRow[]> {
  const sb = supabaseAdmin();
  // Pull all transfer_out transactions then group in JS — Supabase JS client
  // doesn't easily express the GROUP BY we need, but the volume here will be
  // tiny (transfers are infrequent vs receipts/issues).
  const { data: outRows } = await sb
    .from('beithady_inventory_transactions')
    .select(`
      doc_id, ts, qty_delta, unit_cost_egp, batch_no, doc_line_no, item_id, created_by_user, note,
      warehouse:beithady_inventory_warehouses!inner(id, code, name_en)
    `)
    .eq('doc_type', 'transfer')
    .eq('type', 'transfer_out')
    .order('ts', { ascending: false })
    .limit((opts.limit ?? 100) * 5); // 5 lines/transfer headroom

  if (!outRows || outRows.length === 0) return [];

  // Supabase JS types !inner joins as arrays; normalise to single object.
  type RawOut = {
    doc_id: string; ts: string; qty_delta: number; unit_cost_egp: number;
    batch_no: string; doc_line_no: number | null; item_id: string;
    created_by_user: string | null; note: string | null;
    warehouse: Array<{ id: string; code: string; name_en: string }>
            | { id: string; code: string; name_en: string };
  };
  const flat = ((outRows as unknown) as RawOut[]).map(r => ({
    ...r,
    warehouse: Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse,
  }));

  const byDocOut = new Map<string, typeof flat>();
  for (const r of flat) {
    const arr = byDocOut.get(r.doc_id) || [];
    arr.push(r);
    byDocOut.set(r.doc_id, arr);
  }

  const docIds = Array.from(byDocOut.keys()).slice(0, opts.limit ?? 100);
  if (docIds.length === 0) return [];

  const { data: inRows } = await sb
    .from('beithady_inventory_transactions')
    .select(`
      doc_id,
      warehouse:beithady_inventory_warehouses!inner(id, code, name_en)
    `)
    .eq('doc_type', 'transfer')
    .eq('type', 'transfer_in')
    .in('doc_id', docIds);

  type RawIn = { doc_id: string; warehouse: Array<{ id: string; code: string; name_en: string }> | { id: string; code: string; name_en: string } };
  const dstByDoc = new Map<string, { id: string; code: string; name_en: string }>();
  for (const r of ((inRows as unknown) as RawIn[] | null) || []) {
    const w = Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse;
    if (w && !dstByDoc.has(r.doc_id)) dstByDoc.set(r.doc_id, w);
  }

  return docIds.map(did => {
    const outs = byDocOut.get(did)!;
    const first = outs[0]!;
    const dst = dstByDoc.get(did);
    const totalQty = outs.reduce((s, r) => s + Math.abs(Number(r.qty_delta)), 0);
    const totalValue = outs.reduce((s, r) => s + (Math.abs(Number(r.qty_delta)) * Number(r.unit_cost_egp)), 0);
    return {
      transfer_id: did,
      posted_at: first.ts,
      src_warehouse_id: first.warehouse.id,
      src_warehouse_code: first.warehouse.code,
      src_warehouse_name: first.warehouse.name_en,
      dst_warehouse_id: dst?.id || '',
      dst_warehouse_code: dst?.code || '—',
      dst_warehouse_name: dst?.name_en || '—',
      line_count: outs.length,
      total_value_egp: totalValue,
      total_qty: totalQty,
      created_by_user: first.created_by_user,
      first_note: first.note,
    };
  });
}

export async function getTransfer(transferId: string): Promise<TransferDetail | null> {
  const sb = supabaseAdmin();

  // Pull the OUT side for the headers
  const { data: outRows } = await sb
    .from('beithady_inventory_transactions')
    .select(`
      doc_line_no, ts, qty_delta, unit_cost_egp, batch_no, item_id, created_by_user, note,
      warehouse:beithady_inventory_warehouses!inner(id, code, name_en),
      item:beithady_inventory_items!inner(sku, name_en, uom)
    `)
    .eq('doc_type', 'transfer')
    .eq('type', 'transfer_out')
    .eq('doc_id', transferId)
    .order('doc_line_no', { ascending: true });

  if (!outRows || outRows.length === 0) return null;

  type RawOut = {
    doc_line_no: number | null;
    ts: string;
    qty_delta: number;
    unit_cost_egp: number;
    batch_no: string;
    item_id: string;
    created_by_user: string | null;
    note: string | null;
    warehouse: Array<{ id: string; code: string; name_en: string }> | { id: string; code: string; name_en: string };
    item: Array<{ sku: string; name_en: string; uom: string }> | { sku: string; name_en: string; uom: string };
  };
  const outs = ((outRows as unknown) as RawOut[]).map(r => ({
    ...r,
    warehouse: Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse,
    item: Array.isArray(r.item) ? r.item[0] : r.item,
  }));
  const first = outs[0];

  const { data: inRow } = await sb
    .from('beithady_inventory_transactions')
    .select('warehouse:beithady_inventory_warehouses!inner(id, code, name_en)')
    .eq('doc_type', 'transfer')
    .eq('type', 'transfer_in')
    .eq('doc_id', transferId)
    .limit(1)
    .maybeSingle();

  type RawIn = { warehouse: Array<{ id: string; code: string; name_en: string }> | { id: string; code: string; name_en: string } };
  const dstRaw = ((inRow as unknown) as RawIn | null)?.warehouse;
  const dst = dstRaw ? (Array.isArray(dstRaw) ? dstRaw[0] : dstRaw) : undefined;
  const totalQty = outs.reduce((s, r) => s + Math.abs(Number(r.qty_delta)), 0);
  const totalValue = outs.reduce((s, r) => s + (Math.abs(Number(r.qty_delta)) * Number(r.unit_cost_egp)), 0);

  return {
    transfer_id: transferId,
    posted_at: first.ts,
    src_warehouse_id: first.warehouse.id,
    src_warehouse_code: first.warehouse.code,
    src_warehouse_name: first.warehouse.name_en,
    dst_warehouse_id: dst?.id || '',
    dst_warehouse_code: dst?.code || '—',
    dst_warehouse_name: dst?.name_en || '—',
    line_count: outs.length,
    total_value_egp: totalValue,
    total_qty: totalQty,
    created_by_user: first.created_by_user,
    first_note: first.note,
    lines: outs.map(r => ({
      doc_line_no: r.doc_line_no,
      item_id: r.item_id,
      item_sku: r.item.sku,
      item_name_en: r.item.name_en,
      item_uom: r.item.uom,
      qty: Math.abs(Number(r.qty_delta)),
      batch_no: r.batch_no,
      unit_cost_egp: Number(r.unit_cost_egp),
    })),
  };
}
