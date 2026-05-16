import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordPaymentForRecurringTemplate } from '@/lib/personal/networth/payment';
import { cairoTodayIso } from '@/lib/fmt-date';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function cairoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false })
      .format(new Date())
  );
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || !auth || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && cairoHour() !== 9) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not 9am Cairo' });
  }

  const today = cairoTodayIso();
  const sb = supabaseAdmin();
  const { data: due, error } = await sb
    .from('personal_networth_recurring_templates')
    .select('id, app_user_id')
    .eq('active', true)
    .lte('next_run_date', today);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Per-template try/catch: one failing template must not abort the others.
  const results: Array<{ templateId: string; paymentId?: string; error?: string }> = [];
  for (const t of due ?? []) {
    try {
      const paymentId = await recordPaymentForRecurringTemplate(t.id, today);
      results.push({ templateId: t.id, paymentId });
    } catch (e) {
      results.push({ templateId: t.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
