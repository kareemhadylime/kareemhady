import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';

export const dynamic = 'force-dynamic';

// GET /api/fmplus/plans
// Returns { ok, plans: [{ id, name }] } for analytic plans whose company_ids
// array includes the FMPLUS company. Drives the AccountPicker.
export async function GET() {
  try {
    const fmplusId = await discoverFmplusCompanyId();
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('odoo_analytic_plans')
      .select('id, name, company_ids')
      .order('name');
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const plans = (data as Array<{ id: number; name: string; company_ids: number[] }>)
      .filter(p => Array.isArray(p.company_ids) && p.company_ids.includes(fmplusId))
      .map(p => ({ id: p.id, name: p.name }));
    return NextResponse.json({ ok: true, plans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
