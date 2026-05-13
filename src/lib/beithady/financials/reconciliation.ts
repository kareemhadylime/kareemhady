import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { VarianceStatus } from './types';

export type ReconciliationRow = {
  account_code: string;
  account_name: string;
  opening_raw: number;
  partner_total: number | null;
  variance: number;
  variance_status: VarianceStatus;
  variance_notes: string | null;
};

export type ReconciliationReport = {
  snapshot_id: string;
  rows: ReconciliationRow[];
  summary: {
    accounts_with_partners: number;
    accounts_awaiting_ledger: number;
    open_variance_count: number;
    total_variance: number;
  };
};

export async function buildReconciliation(params: {
  snapshot_id: string;
}): Promise<ReconciliationReport> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, account_name, opening_raw, partner_total, variance, variance_status, variance_notes')
    .eq('snapshot_id', params.snapshot_id);
  if (error) throw new Error(`buildReconciliation: ${error.message}`);
  const rows = (data ?? []).map((r) => ({
    account_code: r.account_code as string,
    account_name: r.account_name as string,
    opening_raw: Number(r.opening_raw),
    partner_total: r.partner_total == null ? null : Number(r.partner_total),
    variance: Number(r.variance),
    variance_status: r.variance_status as VarianceStatus,
    variance_notes: (r.variance_notes as string | null) ?? null,
  }));
  const summary = {
    accounts_with_partners: rows.filter((r) => r.partner_total !== null).length,
    accounts_awaiting_ledger: rows.filter((r) => r.partner_total === null).length,
    open_variance_count: rows.filter(
      (r) => r.variance_status === 'open' && r.variance !== 0
    ).length,
    total_variance:
      Math.round(rows.reduce((s, r) => s + (r.variance ?? 0), 0) * 100) / 100,
  };
  return { snapshot_id: params.snapshot_id, rows, summary };
}
