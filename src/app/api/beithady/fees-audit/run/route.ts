import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { buildFeeStack } from '@/lib/beithady/fees-audit/build-fee-stack';
import type { FeeAuditConfig } from '@/lib/beithady/fees-audit/types';

export const runtime = 'nodejs';
export const maxDuration = 90;

// Minimal shape check on the FeeAuditConfig payload. The full shape is
// large and lives in fees-audit/types.ts; we only enforce the fields the
// builder actually requires + reasonable bounds. Anything extra passes
// through to buildFeeStack().
const Body = z.object({
  config: z.object({
    startDate: z.string().min(8).max(20),
    windowDays: z.number().int().positive().max(366),
  }).passthrough(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }
  const data = await buildFeeStack(parsed.data.config as FeeAuditConfig);
  return NextResponse.json({ data });
}
