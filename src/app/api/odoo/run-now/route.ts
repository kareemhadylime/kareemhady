import { NextRequest, NextResponse } from 'next/server';
import { runOdooSync } from '@/lib/run-odoo-sync';

// Manual trigger for the Odoo sync. Bearer-protected (CRON_SECRET) since it
// touches the same finance tables the cron writes to.
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/odoo/run-now

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured on server' },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }
  const result = await runOdooSync('manual');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET alias for easy curling — same auth check.
export async function GET(req: NextRequest) {
  return handle(req);
}
