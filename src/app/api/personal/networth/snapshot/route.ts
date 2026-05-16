import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { takeSnapshot } from '@/lib/personal/networth/snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const result = await takeSnapshot(user.id, 'manual');
  return NextResponse.json({ ok: true, ...result });
}
