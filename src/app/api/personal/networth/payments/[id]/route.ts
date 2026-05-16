import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// DELETE a payment row. V1 semantics:
// - The payment row is hard-deleted.
// - If the payment was linked to a schedule (loan_schedule_id non-null),
//   the schedule row is reset to unpaid so the UI stays consistent.
// - Liability balance is NOT auto-restored on delete. For card payments or
//   schedule-linked payments, the user should adjust the balance manually
//   via the liability detail page if the deleted payment had already drawn
//   it down. This keeps the delete endpoint simple and predictable; a
//   future revision can layer atomic balance restoration on top.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: pmt, error: readErr } = await sb
    .from('personal_networth_payments')
    .select('id, loan_schedule_id')
    .eq('id', id)
    .eq('app_user_id', user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!pmt) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  if (pmt.loan_schedule_id) {
    const { error: schErr } = await sb
      .from('personal_networth_liability_schedule')
      .update({ paid_on: null, paid_amount: null, payment_id: null })
      .eq('id', pmt.loan_schedule_id);
    if (schErr) {
      return NextResponse.json(
        { ok: false, error: `schedule row reset failed: ${schErr.message}` },
        { status: 500 },
      );
    }
  }

  const { error: delErr } = await sb
    .from('personal_networth_payments')
    .delete()
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
