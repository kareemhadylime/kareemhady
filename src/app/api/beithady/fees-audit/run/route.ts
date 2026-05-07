import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { buildFeeStack } from '@/lib/beithady/fees-audit/build-fee-stack';
import type { FeeAuditConfig } from '@/lib/beithady/fees-audit/types';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: { config: FeeAuditConfig };
  try {
    body = (await req.json()) as { config: FeeAuditConfig };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.config?.startDate || !body.config?.windowDays) {
    return NextResponse.json({ error: 'invalid config' }, { status: 400 });
  }
  const data = await buildFeeStack(body.config);
  return NextResponse.json({ data });
}
