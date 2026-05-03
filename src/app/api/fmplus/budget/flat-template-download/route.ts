import { NextResponse } from 'next/server';
import { writeFlatBudgetXlsx } from '@/lib/fmplus/budget/parsers/flat-template-export';

export async function GET() {
  const buf = await writeFlatBudgetXlsx([]);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="fmplus-budget-template.xlsx"',
    },
  });
}
