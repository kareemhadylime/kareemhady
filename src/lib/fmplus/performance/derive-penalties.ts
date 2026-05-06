// src/lib/fmplus/performance/derive-penalties.ts
import { supabaseAdmin } from '@/lib/supabase';
import type { PenaltiesBlock, PenaltyRow, PenaltyService, PenaltyType } from './types';

const SERVICE_LABELS: Record<PenaltyService, string> = {
  hk: 'Housekeeping',
  mep: 'MEP',
  landscape: 'Landscape',
  security: 'Security',
  pest_ctrl: 'Pest Control',
  waste_mgmt: 'Waste Management',
  other: 'Other',
};

export async function penaltiesBlock(args: {
  project_id: number;
  from: string;
  to: string;
}): Promise<PenaltiesBlock | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_penalties', {
    p_analytic_id: args.project_id,
    p_from: args.from,
    p_to: args.to,
  });
  if (error) throw error;
  const raw = (data ?? []) as Array<{
    service_code: string;
    penalty_type: string;
    amount: number | string;
    lines: number;
  }>;
  if (raw.length === 0) return null;
  const rows: PenaltyRow[] = raw.map(r => {
    const svc = (r.service_code as PenaltyService) ?? 'other';
    return {
      service_code: svc,
      service_label: SERVICE_LABELS[svc] ?? r.service_code,
      penalty_type: (r.penalty_type as PenaltyType) ?? 'other',
      amount: Number(r.amount) || 0,
      lines: r.lines ?? 0,
    };
  });
  const total_amount = rows.reduce((a, r) => a + r.amount, 0);
  const total_lines = rows.reduce((a, r) => a + r.lines, 0);
  if (total_amount === 0 && total_lines === 0) return null;
  return { total_amount, total_lines, rows };
}
