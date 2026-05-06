// src/lib/fmplus/performance/derive-vendors.ts
import { supabaseAdmin } from '@/lib/supabase';
import type { VendorRow } from './types';

export async function topVendors(args: {
  contract_id: number;
  project_id: number;          // odoo_analytic_account.id == project_contracts.project_id
  from: string;
  to: string;
  period_total: number;
}): Promise<VendorRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_top_vendors', {
    p_analytic_id: args.project_id,
    p_from: args.from,
    p_to: args.to,
    p_limit: 5,
  });
  if (error) throw error;
  const rows = (data ?? []) as { partner_id: number; partner_name: string; spend: number; invoice_count: number }[];
  return rows.map(r => ({
    partner_id: r.partner_id,
    partner_name: r.partner_name,
    spend: r.spend,
    invoice_count: r.invoice_count,
    pct_of_period: args.period_total > 0 ? r.spend / args.period_total : 0,
    drill_url: `/api/fmplus/budget/variance-drill?contract=${args.contract_id}&from=${args.from}&to=${args.to}&partner=${r.partner_id}`,
  }));
}
