import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isVipDigestEnabled } from '@/lib/beithady/settings';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// VIP digest — runs daily at 06:00 UTC = 09:00 Cairo. Compiles every
// AI auto-sent reply on a VIP / gold / platinum thread from the past
// 24 hours into a structured summary. Persists to beithady_settings
// under vip_digest_latest + dated snapshot. Phase F adds the actual
// WhatsApp/email delivery to admins.

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    console.error('[cron beithady-vip-digest] CRON_SECRET unset — refusing');
    return false;
  }
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const enabled = await isVipDigestEnabled();
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: 'vip_digest_disabled' });
  }

  const sb = supabaseAdmin();
  try {
    const { data: rows } = await sb
      .from('beithady_vip_digest_24h')
      .select('*')
      .order('created_at', { ascending: false });

    const items = (rows as Array<{
      id: string;
      conversation_id: string;
      classification: string;
      confidence: number;
      suggested_reply: string;
      created_at: string;
      guest_full_name: string | null;
      guest_phone: string | null;
      guest_email: string | null;
      listing_nickname: string | null;
      building_code: string | null;
      vip: boolean;
      loyalty_tier: string;
    }> | null) || [];

    const summary = {
      generated_at: new Date().toISOString(),
      count: items.length,
      items: items.map(r => ({
        log_id: r.id,
        conversation_id: r.conversation_id,
        guest: r.guest_full_name || r.guest_email || r.guest_phone,
        listing: r.listing_nickname,
        building: r.building_code,
        vip: r.vip,
        tier: r.loyalty_tier,
        classification: r.classification,
        confidence: Number(r.confidence),
        sent_at: r.created_at,
        suggested_reply: (r.suggested_reply || '').slice(0, 280),
      })),
      by_classification: tally(items, r => r.classification),
      by_tier: tally(items, r => r.loyalty_tier),
    };

    const dateKey = new Date().toISOString().slice(0, 10);
    await Promise.all([
      sb.from('beithady_settings').upsert(
        { key: 'vip_digest_latest', value: summary as unknown as object, description: 'Latest 24h VIP auto-reply digest (auto-overwritten).' },
        { onConflict: 'key' }
      ),
      sb.from('beithady_settings').upsert(
        { key: `vip_digest_${dateKey}`, value: summary as unknown as object, description: `VIP digest snapshot ${dateKey}.` },
        { onConflict: 'key' }
      ),
    ]);

    await recordAudit({
      module: 'communication',
      action: 'vip_digest_generated',
      metadata: {
        count: items.length,
        by_classification: summary.by_classification,
        by_tier: summary.by_tier,
        delivery_pending_phase: 'F',
      },
    });

    return NextResponse.json({ ok: true, count: items.length, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function tally<T>(rows: T[], pick: (r: T) => string): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}
