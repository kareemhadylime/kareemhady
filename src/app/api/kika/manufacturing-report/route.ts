import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireDomainAccess } from '@/lib/auth';
import { buildKikaManufacturingReport } from '@/lib/kika-manufacturing';
import { KikaManufacturingPdf } from '@/lib/kika-manufacturing-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  await requireDomainAccess('kika');
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const label = sp.get('label') ?? '';

  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json(
      { error: 'invalid_range', detail: 'Expected from=YYYY-MM-DD&to=YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const report = await buildKikaManufacturingReport({
    fromDate: from,
    toDate: to,
    label: label || `${from} → ${to}`,
  });

  const generatedAt = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = React.createElement(KikaManufacturingPdf, {
    report,
    generatedAt,
  });
  const buffer = await renderToBuffer(element);

  const filename = `kika-manufacturing-plan-${from}-to-${to}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
