import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordPaymentForRecurringTemplate } from '@/lib/personal/networth/payment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cairoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const today = cairoToday();
  const sb = supabaseAdmin();
  const { data: due, error } = await sb
    .from('personal_networth_recurring_templates')
    .select('id')
    .eq('app_user_id', user.id)
    .eq('active', true)
    .lte('next_run_date', today);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Per-template try/catch (mirror cron route)
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
