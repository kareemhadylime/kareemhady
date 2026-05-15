// src/lib/beithady/financials/ledgers.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { CompanyScope, PartnerKind } from './types';

const SCOPE_TO_COMPANY_IDS: Record<CompanyScope, number[]> = {
  consolidated: [5, 10],
  egypt: [5],
  dubai: [10],
  a1: [4],
};

export type LedgerRow = {
  partner_id: number | null;
  partner_name_raw: string;
  account_code: string;
  partner_kind: PartnerKind;
  is_synthetic: boolean;
  opening_balance: number;
  delta: number;
  current_balance: number;
  last_move_date: string | null;
};

export type LedgerReport = {
  rows: LedgerRow[];
  snapshot_id: string | null;
  opening_period_end: string | null;
};

export async function buildLedgerReport(params: {
  kind: PartnerKind | 'all';
  scope: CompanyScope;
  as_of: string;
}): Promise<LedgerReport> {
  const sb = supabaseAdmin();

  // 1. Latest frozen snapshot for scope at or before as_of.
  const { data: snap, error: snapErr } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end')
    .eq('company_scope', params.scope)
    .eq('status', 'frozen')
    .lte('period_end', params.as_of)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapErr) throw new Error(`buildLedgerReport snap: ${snapErr.message}`);

  if (!snap) {
    return { rows: [], snapshot_id: null, opening_period_end: null };
  }

  // 2. Partner rows.
  let q = sb
    .from('bh_balance_snapshot_partners')
    .select('partner_id, partner_name_raw, partner_kind, is_synthetic, opening_balance, account_code')
    .eq('snapshot_id', snap.id);
  if (params.kind !== 'all') q = q.eq('partner_kind', params.kind);
  const { data: parts, error: partsErr } = await q;
  if (partsErr) throw new Error(`buildLedgerReport partners: ${partsErr.message}`);

  // 3. Odoo deltas after the snapshot period_end, per partner.
  const companyIds = SCOPE_TO_COMPANY_IDS[params.scope];
  const partnerIds = (parts ?? [])
    .map((p) => p.partner_id)
    .filter((x): x is number => typeof x === 'number');

  const deltas = new Map<number, { sum: number; last_date: string | null }>();
  if (partnerIds.length > 0) {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: lines, error: linesErr } = await sb
        .from('odoo_move_lines')
        .select('id, partner_id, balance, date, company_id')
        .in('company_id', companyIds)
        .in('partner_id', partnerIds)
        .gt('date', snap.period_end)
        .lte('date', params.as_of)
        .eq('parent_state', 'posted')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (linesErr) throw new Error(`buildLedgerReport moves: ${linesErr.message}`);
      if (!lines || lines.length === 0) break;
      for (const ln of lines as Array<{ partner_id: number | null; balance: number; date: string | null }>) {
        if (ln.partner_id == null) continue;
        const cur = deltas.get(ln.partner_id) ?? { sum: 0, last_date: null };
        cur.sum += Number(ln.balance);
        if (ln.date && (!cur.last_date || ln.date > cur.last_date)) cur.last_date = ln.date;
        deltas.set(ln.partner_id, cur);
      }
      if (lines.length < PAGE) break;
      offset += PAGE;
    }
  }

  const rows: LedgerRow[] = (parts ?? []).map((p) => {
    const d = p.partner_id != null ? deltas.get(p.partner_id) : null;
    const delta = d?.sum ?? 0;
    return {
      partner_id: p.partner_id ?? null,
      partner_name_raw: p.partner_name_raw,
      account_code: p.account_code,
      partner_kind: p.partner_kind as PartnerKind,
      is_synthetic: p.is_synthetic,
      opening_balance: Number(p.opening_balance),
      delta: Math.round(delta * 100) / 100,
      current_balance: Math.round((Number(p.opening_balance) + delta) * 100) / 100,
      last_move_date: d?.last_date ?? null,
    };
  });

  return {
    rows,
    snapshot_id: snap.id,
    opening_period_end: snap.period_end,
  };
}
