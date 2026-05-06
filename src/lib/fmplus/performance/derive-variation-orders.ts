// src/lib/fmplus/performance/derive-variation-orders.ts
import { supabaseAdmin } from '@/lib/supabase';
import type { VariationOrdersBlock, VoCategory, VoRow } from './types';

const CAT_LABELS: Record<VoCategory, string> = {
  manning: 'Manning',
  consumables: 'Consumables',
  transport: 'Transport',
  other: 'Other',
};

export async function variationOrdersBlock(args: {
  project_id: number;
  from: string;
  to: string;
}): Promise<VariationOrdersBlock | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_variation_orders', {
    p_analytic_id: args.project_id,
    p_from: args.from,
    p_to: args.to,
  });
  if (error) throw error;
  const raw = (data ?? []) as Array<{ category: string; amount: number | string; lines: number }>;
  if (raw.length === 0) return null;
  const rows: VoRow[] = raw.map(r => {
    const cat = (r.category as VoCategory) ?? 'other';
    return {
      category: cat,
      category_label: CAT_LABELS[cat] ?? r.category,
      amount: Number(r.amount) || 0,
      lines: r.lines ?? 0,
    };
  });
  const total_amount = rows.reduce((a, r) => a + r.amount, 0);
  const total_lines = rows.reduce((a, r) => a + r.lines, 0);
  if (total_amount === 0 && total_lines === 0) return null;
  return { total_amount, total_lines, rows };
}
