'use server';
import { revalidatePath } from 'next/cache';

export async function backfillAdsBreakdownsAction(): Promise<void> {
  const secret = process.env.CRON_SECRET || '';
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
  const url = `${base}/api/cron/beithady-ads-breakdowns?force=1&secret=${encodeURIComponent(secret)}&from=${from}&to=${today}`;
  await fetch(url, { method: 'GET', cache: 'no-store' });
  revalidatePath('/admin/integrations');
  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/audience');
}
