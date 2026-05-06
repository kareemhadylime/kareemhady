// src/app/api/fmplus/performance/[contractId]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildContractDashboard } from '@/lib/fmplus/performance/build-dashboard';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

const QuerySchema = z.object({
  chip: z.enum(['prev-month', 'last-3', 'last-quarter', 'ytd', 'last-year', 'custom']).default('prev-month'),
  from: z.string().optional(),
  to: z.string().optional(),
  compare: z.enum(['0', '1']).optional(),
  offset: z.coerce.number().int().positive().optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ contractId: string }> }) {
  await requireBudgetView();
  const { contractId } = await ctx.params;
  const id = Number(contractId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'invalid contractId' }, { status: 400 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const period = resolvePeriod({
    chip: parsed.data.chip as PeriodChip,
    from: parsed.data.from,
    to: parsed.data.to,
    offset: parsed.data.offset,
  });

  const payload = await buildContractDashboard({
    contract_id: id,
    period,
    compare: parsed.data.compare === '1',
  });

  return NextResponse.json(payload);
}
