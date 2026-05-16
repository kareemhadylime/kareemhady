import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_settings')
    .select('*')
    .eq('app_user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_settings')
    .upsert(
      {
        app_user_id: user.id,
        charity_goal_egp_year: body.charityGoalEgpYear ?? null,
        default_currency: body.defaultCurrency ?? 'EGP',
        monthly_snapshot_day: body.monthlySnapshotDay ?? 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'app_user_id' },
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
