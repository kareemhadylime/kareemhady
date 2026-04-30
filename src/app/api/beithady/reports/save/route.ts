// POST /api/beithady/reports/save — persist a ReportConfig as a saved report.
// Gated: BA + ops + manager + admin (analytics:full).

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { ReportConfig } from '@/lib/beithady/reports/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'full'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: {
    config: ReportConfig;
    commentary?: { bullets: string[]; action_items?: string[]; notes?: string };
    last_run_data?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.config?.title || !body.config?.periods?.length) {
    return NextResponse.json({ error: 'invalid config' }, { status: 400 });
  }

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
