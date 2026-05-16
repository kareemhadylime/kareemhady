import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireDomainAccess } from '@/lib/auth';
import { buildKikaPickerReport, type PickerScope } from '@/lib/kika-picker';
import { KikaPickerPdf } from '@/lib/kika-picker-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_SCOPES: PickerScope[] = ['all', 'older_than_7d', 'older_than_14d', 'this_week'];

export async function GET(req: NextRequest) {
  await requireDomainAccess('kika');
  const sp = req.nextUrl.searchParams;
  const scopeRaw = sp.get('scope') ?? 'all';
  const scope: PickerScope = (VALID_SCOPES as string[]).includes(scopeRaw)
    ? (scopeRaw as PickerScope)
    : 'all';

  const report = await buildKikaPickerReport({ scope });

  const generatedAt = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = React.createElement(KikaPickerPdf, { report, generatedAt });
  const buffer = await renderToBuffer(element);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `kika-picker-report-${stamp}-${scope}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
