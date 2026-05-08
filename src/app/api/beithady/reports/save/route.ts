// POST /api/beithady/reports/save — persist a ReportConfig as a saved report.
// Gated: BA + ops + manager + admin (analytics:full).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { ReportConfig } from '@/lib/beithady/reports/types';

export const runtime = 'nodejs';

// Minimal payload shape. The full ReportConfig is large and lives in
// reports/types.ts; we only enforce the fields we touch directly.
const Body = z.object({
  config: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    template_key: z.string().max(80).optional().nullable(),
    periods: z.array(z.unknown()).min(1),
  }).passthrough(),
  commentary: z.object({
    bullets: z.array(z.string()),
    action_items: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }).optional().nullable(),
  last_run_data: z.unknown().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'full'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsedBody = Body.safeParse(raw);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedBody.error.issues }, { status: 400 });
  }
  const body = parsedBody.data as {
    config: ReportConfig;
    commentary?: { bullets: string[]; action_items?: string[]; notes?: string };
    last_run_data?: unknown;
  };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_saved_reports')
    .insert({
      title: body.config.title,
      description: body.config.description || null,
      config: body.config,
      commentary: body.commentary || null,
      template_key: body.config.template_key || null,
      created_by: user.id,
      last_run_at: body.last_run_data ? new Date().toISOString() : null,
      last_run_data: body.last_run_data || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[reports/save] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
