import { NextRequest, NextResponse } from 'next/server';
import {
  syncOdooAccounts,
  syncOdooPartners,
  syncOdooMoveLines,
  finalizeOwnerFlag,
  FINANCIALS_COMPANY_IDS,
} from '@/lib/run-odoo-financial-sync';

// Phased financial sync. Each phase is bounded so it stays under Vercel's
// 300s function cap. Call in order:
//   ?phase=accounts
//   ?phase=partners
//   ?phase=move-lines&company=5
//   ?phase=move-lines&company=10
//   ?phase=finalize
// Or ?phase=all to run the full sequence (only safe on cron with a
// longer-running environment — pure client calls still split).
//
// All phases are bearer-protected (CRON_SECRET).

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }
  const phase = req.nextUrl.searchParams.get('phase') || 'help';
  const companyParam = req.nextUrl.searchParams.get('company');

  try {
    switch (phase) {
      case 'accounts':
        return NextResponse.json(await syncOdooAccounts());
      case 'partners':
        return NextResponse.json(await syncOdooPartners());
      case 'move-lines': {
        const companyId = Number(companyParam);
        if (!Number.isFinite(companyId)) {
          return NextResponse.json(
            { ok: false, error: 'company param required for move-lines phase' },
            { status: 400 }
          );
        }
        return NextResponse.json(await syncOdooMoveLines(companyId));
      }
      case 'finalize':
        return NextResponse.json(await finalizeOwnerFlag());
      case 'all': {
        const acc = await syncOdooAccounts();
        const par = await syncOdooPartners();
        const ml: Record<string, unknown> = {};
        for (const cid of FINANCIALS_COMPANY_IDS) {
          ml[`company_${cid}`] = await syncOdooMoveLines(cid);
        }
        const fin = await finalizeOwnerFlag();
        return NextResponse.json({
          ok: true,
          accounts: acc,
          partners: par,
          move_lines: ml,
          owner_flag: fin,
        });
      }
      default:
        return NextResponse.json({
          ok: false,
          error: 'unknown phase',
          hint: 'use ?phase=accounts | partners | move-lines&company=N | finalize | all',
          financials_company_ids: FINANCIALS_COMPANY_IDS,
        });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
