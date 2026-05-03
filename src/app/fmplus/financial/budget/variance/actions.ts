'use server';
import { cellToMoveLines, type DrillResult } from '@/lib/fmplus/budget/variance-drill';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import { ServiceLineSchema } from '@/lib/fmplus/budget/schema';

export async function loadDrillAction(args: {
  projectId: number;
  year: number;
  serviceLine: string;
  templateVersion: number;
  category: string;
  month: number;
}): Promise<{ ok: true; rows: DrillResult[] } | { ok: false; error: string }> {
  const slParse = ServiceLineSchema.safeParse(args.serviceLine);
  if (!slParse.success) return { ok: false, error: 'Invalid service line' };
  const tpl = getTemplate(slParse.data, args.templateVersion);
  const rows = await cellToMoveLines({
    projectId: args.projectId,
    category: args.category,
    month: args.month,
    year: args.year,
    accountMap: tpl.account_map_json,
  });
  return { ok: true, rows };
}
