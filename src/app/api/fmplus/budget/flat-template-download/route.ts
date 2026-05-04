import { NextResponse } from 'next/server';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { exportEmptyFlatTemplate } from '@/lib/fmplus/budget/parsers/flat-template-export';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireBudgetView();
  const buf = await exportEmptyFlatTemplate();
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="fmplus-budget-flat-template-v2.xlsx"`,
    },
  });
}
