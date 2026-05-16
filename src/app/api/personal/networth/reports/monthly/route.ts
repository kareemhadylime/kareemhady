import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getMonthlyReport } from '@/lib/personal/networth/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Single-user net-worth module. Read-only, admin-only. Year/month default
// to the *Cairo* current month so the picker is anchored to wall-clock TZ
// (the Vercel server runs in UTC, which means the prior month would be
// returned for the first 2–3 hours after midnight UTC).
const QuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);

  const cairoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const cairoYear = cairoParts.find(p => p.type === 'year')?.value;
  const cairoMonth = cairoParts.find(p => p.type === 'month')?.value;

  const parsed = QuerySchema.safeParse({
    year: url.searchParams.get('year') ?? cairoYear,
    month: url.searchParams.get('month') ?? cairoMonth,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const report = await getMonthlyReport(user.id, parsed.data.year, parsed.data.month);
  return NextResponse.json({ ok: true, report });
}
