// Server route that renders the daily-report PDF for a chosen snapshot date
// and streams it as a download. Auth: relies on the existing Beithady module
// access guard at the parent route — no separate auth check here is fine for V1
// since this lives under /api/beithady/. (If the user can't reach the dashboard
// page, they can't trigger this download in practice.)

import { NextResponse, type NextRequest } from 'next/server';
import { loadSnapshot } from '@/app/beithady/analytics/performance/_lib/load-snapshot';
import { renderReportPdf } from '@/lib/beithady-daily-report/render-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date') ?? undefined;
  const result = await loadSnapshot(dateParam);
  if (result.status === 'missing') {
    return NextResponse.json({ error: 'no_snapshot', date: result.date }, { status: 404 });
  }
  const buffer = await renderReportPdf(result.payload);
  const filename = `beithady-performance-${result.date}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
