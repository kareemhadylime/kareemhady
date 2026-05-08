import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { BuildingSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ code: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { code } = await ctx.params;
  const body = await req.json();
  const parsedResult = BuildingSchema.partial().omit({ building_code: true }).safeParse(body);
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const parsed = parsedResult.data;

  const sb = supabaseAdmin();
  const before = await sb.from('fnb_buildings').select('*').eq('building_code', code).single();
  if (before.error) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data, error } = await sb.from('fnb_buildings')
    .update(parsed as never).eq('building_code', code).select().single();
  if (error) {
    console.error('[fnb/buildings/[code]] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }

  await recordAudit({
    module: 'fnb',
    actor_user_id: user.id,
    action: 'building.update',
    target_type: 'building',
    target_id: code,
    before: before.data,
    after: data,
  });

  return NextResponse.json({ building: data });
}
