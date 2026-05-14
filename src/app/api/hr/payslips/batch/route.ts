// src/app/api/hr/payslips/batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getCurrentUser } from '@/lib/auth';
import { getMonthEntries, entryToPayslipData, getPayrollMonth } from '@/lib/beithady/hr/hr-payroll-queries';
import { PayslipEn } from '@/app/beithady/hr/payroll/_components/payslip-en';
import { PayslipAr } from '@/app/beithady/hr/payroll/_components/payslip-ar';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import type { PayslipBatchFilter } from '@/lib/beithady/hr/hr-payroll-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BodySchema = z.object({
  monthId: z.string().uuid(),
  filters: z.object({
    building_codes:     z.array(z.string()).optional(),
    departments:        z.array(z.string()).optional(),
    exclude_terminated: z.boolean().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { monthId, filters = {} } = parsed.data;
  const batchFilter: PayslipBatchFilter = {
    ...filters,
    exclude_terminated: filters.exclude_terminated ?? true,
  };

  const [entries, month] = await Promise.all([
    getMonthEntries(monthId, batchFilter),
    getPayrollMonth(monthId),
  ]);

  if (!month) return NextResponse.json({ error: 'Month not found' }, { status: 404 });
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No entries match the filter' }, { status: 404 });
  }

  // Render each payslip individually, then merge with pdf-lib
  const buffers: Buffer[] = [];
  for (const entry of entries) {
    const data = entryToPayslipData(entry, month.label);
    const el = entry.payslip_language === 'english'
      ? React.createElement(PayslipEn, { data })
      : React.createElement(PayslipAr, { data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await renderToBuffer(el as any);
    buffers.push(buf);
  }

  // Merge all single-page PDFs into one document
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const [page] = await merged.copyPages(src, [0]);
    merged.addPage(page);
  }
  const mergedBytes = await merged.save();

  const safeMonth = month.label.replace(/\s+/g, '-');
  const filename = `payslips-${safeMonth}-${entries.length}employees.pdf`;

  return new NextResponse(Buffer.from(mergedBytes) as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
