import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Flip `active` for a recurring template. POST with no body; returns
// the new active value so the client can update its row state without
// a refetch.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: row, error: fetchErr } = await sb
    .from('personal_networth_recurring_templates')
    .select('active')
    .eq('id', id)
    .eq('app_user_id', user.id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  const r = row as { active: boolean };
  const next = !r.active;
  const { error } = await sb
    .from('personal_networth_recurring_templates')
    .update({ active: next, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, active: next });
}
