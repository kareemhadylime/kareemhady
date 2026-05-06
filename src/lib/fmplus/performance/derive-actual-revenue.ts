// src/lib/fmplus/performance/derive-actual-revenue.ts
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Returns the period's actual ex-VAT revenue from Odoo move lines for a contract.
 * Sum of credit-debit on income-type accounts that touch the analytic account.
 * Returns 0 when no posted revenue lines exist for the period.
 */
export async function actualRevenue(args: {
  project_id: number;       // odoo_analytic_account.id == project_contracts.project_id
  from: string;
  to: string;
}): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_actual_revenue', {
    p_analytic_id: args.project_id,
    p_from: args.from,
    p_to: args.to,
  });
  if (error) throw error;
  // RPC returns a single numeric value. Supabase wraps it as the data field.
  if (data === null || data === undefined) return 0;
  if (typeof data === 'number') return data;
  if (typeof data === 'string') return Number.parseFloat(data) || 0;
  return Number(data) || 0;
}
