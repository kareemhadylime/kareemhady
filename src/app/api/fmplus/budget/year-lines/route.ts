import { NextResponse } from 'next/server';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireBudgetView();
  const url = new URL(req.url);
  const yearId = Number(url.searchParams.get('year_id'));
  if (!Number.isFinite(yearId) || yearId <= 0) {
    return NextResponse.json({ error: 'invalid year_id' }, { status: 400 });
  }
  const sb = budgetDb();
  const [lines, services] = await Promise.all([
    sb.from(TABLES.lines)
      .select('id, line_code, service_line, category, label_en, label_ar, qty, unit_cost')
      .eq('year_id', yearId),
    sb.from(TABLES.year_services)
      .select('service_line, monthly_revenue')
      .eq('year_id', yearId),
  ]);
  return NextResponse.json({
    lines: (lines.data ?? []).map(l => ({
      ...l,
      qty: Number(l.qty),
      unit_cost: Number(l.unit_cost),
    })),
    annualRevenue: ((services.data ?? []) as { monthly_revenue: number }[])
      .reduce((a, s) => a + Number(s.monthly_revenue) * 12, 0),
  });
}
