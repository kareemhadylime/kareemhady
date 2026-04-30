// POST /api/beithady/reports/run — build a ReportData from a config payload.
// No persistence; used by the live builder preview. Saved-report runs go via
// /api/beithady/reports/[id]/run (which writes to beithady_report_runs).

import { NextResponse } from 'next/server';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';
import { buildReport } from '@/lib/beithady/reports/build-report';
import { generateCommentary } from '@/lib/beithady/reports/ai-commentary';
import type { ReportConfig } from '@/lib/beithady/reports/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { config: ReportConfig; commentary?: boolean };
  try {
    body = (await req.json()) as { config: ReportConfig; commentary?: boolean };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.config || !body.config.periods?.length || !body.config.metrics?.length) {
    return NextResponse.json({ error: 'invalid config' }, { status: 400 });
  }

  const data = await buildReport(body.config);

  if (body.commentary !== false && body.config.enableAiCommentary !== false) {
    const c = await generateCommentary(data);
    if (c) data.commentary = c;
  }

  return NextResponse.json({ data });
}
