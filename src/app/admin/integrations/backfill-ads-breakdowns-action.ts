'use server';
import { revalidatePath } from 'next/cache';

export async function backfillAdsBreakdownsAction(): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.CRON_SECRET || '';
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
  const url = `${base}/api/cron/beithady-ads-breakdowns?force=1&secret=${encodeURIComponent(secret)}&from=${from}&to=${today}`;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[backfill-ads-breakdowns] cron returned', res.status, text);
      return { ok: false, error: `cron_returned_${res.status}` };
    }
    revalidatePath('/admin/integrations');
    revalidatePath('/beithady/ads');
    revalidatePath('/beithady/ads/audience');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[backfill-ads-breakdowns] fetch failed:', msg);
    return { ok: false, error: msg };
  }
}
