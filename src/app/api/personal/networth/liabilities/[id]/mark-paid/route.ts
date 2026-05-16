import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { recordPaymentForSchedule } from '@/lib/personal/networth/payment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation. recordPaymentForSchedule looks up the
// schedule row by id; the liability_id path param is here for routing
// hygiene but not used directly to find the schedule.
const MarkPaidBody = z.object({
  scheduleId: z.string().uuid(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().positive(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!user.is_admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  await params; // path param consumed (used for routing only)

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = MarkPaidBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const paymentId = await recordPaymentForSchedule(parsed.data.scheduleId, {
      appUserId: user.id,
      occurredOn: parsed.data.occurredOn,
      amount: parsed.data.amount,
    });
    return NextResponse.json({ ok: true, paymentId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
