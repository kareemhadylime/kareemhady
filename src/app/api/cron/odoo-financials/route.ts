import { NextRequest, NextResponse } from 'next/server';
import {
  syncOdooAccounts,
  syncOdooPartners,
  syncOdooMoveLines,
  syncOdooAnalyticPlans,
  syncOdooAnalyticAccounts,
  rebuildAnalyticLinks,
  finalizeOwnerFlag,
} from '@/lib/run-odoo-financial-sync';

// Cron-dispatched financial sync. Each cron entry in vercel.json maps to a
// specific `?phase=X` so one phase runs per invocation — keeps us under the
// 300s function cap and provides automatic daily refresh.
//
// Scheduled phases (all UTC):
//   04:00  /api/cron/odoo                          → companies + invoices
//   04:05  /api/cron/odoo-financials?phase=metadata→ accounts + partners
//   04:10  ?phase=move-lines-4                     → A1 move lines
//   04:15  ?phase=move-lines-5                     → Beithady Egypt move lines
//   04:20  ?phase=move-lines-10                    → Beithady Dubai move lines
//   04:25  ?phase=analytics                        → analytic plans + accounts + links
//   04:30  ?phase=finalize                         → owner flag

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const phase = req.nextUrl.searchParams.get('phase');

  try {
    switch (phase) {
      case 'metadata': {
        const accounts = await syncOdooAccounts();
        const partners = await syncOdooPartners();
        return NextResponse.json({ ok: true, phase, accounts, partners });
      }
      case 'move-lines-4':
        return NextResponse.json({
          ok: true,
          phase,
          result: await syncOdooMoveLines(4, { resume: true }),
        });
      case 'move-lines-5':
        return NextResponse.json({
          ok: true,
          phase,
          result: await syncOdooMoveLines(5, { resume: true }),
        });
      case 'move-lines-10':
        return NextResponse.json({
          ok: true,
          phase,
          result: await syncOdooMoveLines(10, { resume: true }),
        });
      case 'analytics': {
        const plans = await syncOdooAnalyticPlans();
        const accounts = await syncOdooAnalyticAccounts();
        const links = await rebuildAnalyticLinks();
        return NextResponse.json({
          ok: true,
          phase,
          plans,
          accounts,
          links,
        });
      }
      case 'finalize':
        return NextResponse.json({
          ok: true,
          phase,
          result: await finalizeOwnerFlag(),
        });
      default:
        return NextResponse.json(
          {
            ok: false,
            error: 'unknown phase',
            hint: 'valid: metadata | move-lines-4 | move-lines-5 | move-lines-10 | analytics | finalize',
          },
          { status: 400 }
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, phase, error: msg }, { status: 500 });
  }
}
