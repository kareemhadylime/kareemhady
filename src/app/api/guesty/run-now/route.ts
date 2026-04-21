import { NextRequest, NextResponse } from 'next/server';
import { runGuestySync } from '@/lib/run-guesty-sync';

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
  const result = await runGuestySync('manual');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
