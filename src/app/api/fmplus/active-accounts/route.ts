import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getFinancialsCompanyIds } from '@/lib/run-odoo-financial-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/fmplus/active-accounts?plan_id=N&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns analytic accounts under `plan_id` with non-zero ABS(balance) activity
// in the (from, to) period. Drives the AccountPicker auto-prune so inactive
// accounts never appear in the chooser.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const planId = Number(sp.get('plan_id'));
  const from = sp.get('from');
  const to = sp.get('to');

  if (!Number.isFinite(planId)) {
    return NextResponse.json(
      { ok: false, error: 'plan_id required (numeric)' },
      { status: 400 }
    );
  }
  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: 'from and to are required' },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { ok: false, error: 'from/to must be YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const companyIds = await getFinancialsCompanyIds();
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_active_accounts', {
    p_plan_id: planId,
    p_from: from,
    p_to: to,
    p_company_ids: companyIds,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    accounts: (data as Array<{ account_id: number; name: string; abs_balance: number }>) || [],
  });
}
