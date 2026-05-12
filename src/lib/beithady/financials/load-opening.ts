import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { CompanyScope } from './types';

export type OpeningAccountRow = {
  account_code: string;
  account_name: string;
  account_type: string;
  account_type_override: string | null;
  opening_raw: number;
};

export type OpeningSnapshotResult = {
  snapshot_id: string | null;
  period_end: string | null;
  accounts: OpeningAccountRow[];
};

export async function loadOpeningBalanceSnapshot(params: {
  period_end: string;
  scope: CompanyScope;
}): Promise<OpeningSnapshotResult> {
  const sb = supabaseAdmin();

  const { data: snap, error: snapErr } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end')
    .eq('period_end', params.period_end)
    .eq('company_scope', params.scope)
    .eq('status', 'frozen')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapErr) {
    throw new Error(`loadOpeningBalanceSnapshot snapshot: ${snapErr.message}`);
  }
  if (!snap) {
    return { snapshot_id: null, period_end: null, accounts: [] };
  }

  const { data: rows, error: rowsErr } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, account_name, account_type, account_type_override, opening_raw')
    .eq('snapshot_id', snap.id);

  if (rowsErr) {
    throw new Error(`loadOpeningBalanceSnapshot accounts: ${rowsErr.message}`);
  }

  return {
    snapshot_id: snap.id,
    period_end: snap.period_end,
    accounts: (rows ?? []).map((r) => ({
      account_code: r.account_code,
      account_name: r.account_name,
      account_type: r.account_type,
      account_type_override: r.account_type_override,
      opening_raw: Number(r.opening_raw),
    })),
  };
}
