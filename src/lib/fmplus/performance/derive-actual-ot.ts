// src/lib/fmplus/performance/derive-actual-ot.ts
import { supabaseAdmin } from '@/lib/supabase';

export async function actualOt(args: {
  project_id: number;
  from: string;
  to: string;
}): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_actual_ot', {
    p_analytic_id: args.project_id,
    p_from: args.from,
    p_to: args.to,
  });
  if (error) throw error;
  if (data === null || data === undefined) return 0;
  if (typeof data === 'number') return data;
  if (typeof data === 'string') return Number.parseFloat(data) || 0;
  return Number(data) || 0;
}
