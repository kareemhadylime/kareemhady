import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { recordCardPayment } from '@/lib/personal/networth/payment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation. Public API accepts 'minimum' for the
// minimum-payment preset; recordCardPayment uses the shorter 'min'
// internally, so we translate below.
const PayCardBody = z.object({
  preset: z.enum(['minimum', 'statement', 'full', 'custom']),
  customAmount: z.number().finite().positive().optional(),
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
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = PayCardBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (parsed.data.preset === 'custom' && parsed.data.customAmount == null) {
    return NextResponse.json(
      { ok: false, error: 'customAmount required when preset=custom' },
      { status: 400 },
    );
  }

  // Translate the public-API preset ('minimum') to the library's internal
  // value ('min') so callers don't need to know the implementation detail.
  const internalPreset =
    parsed.data.preset === 'minimum' ? 'min' : parsed.data.preset;

  try {
    const paymentId = await recordCardPayment(
      id,
      user.id,
      internalPreset,
      parsed.data.customAmount,
    );
    return NextResponse.json({ ok: true, paymentId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
