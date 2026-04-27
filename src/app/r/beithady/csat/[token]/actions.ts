'use server';
import { redirect } from 'next/navigation';
import { recordCsatResponse } from '@/lib/beithady/engagement/csat';

// Public action — no auth, gated entirely by token validation in the
// recordCsatResponse helper.
export async function submitCsatAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') || '').trim();
  const npsRaw = formData.get('nps');
  const comment = String(formData.get('comment') || '').trim();
  const nps = Number.parseInt(typeof npsRaw === 'string' ? npsRaw : '', 10);

  if (!token || !Number.isFinite(nps)) {
    redirect(`/r/beithady/csat/${token}?error=missing_nps`);
  }

  const r = await recordCsatResponse(token, nps, comment);
  if (!r.ok) {
    redirect(`/r/beithady/csat/${token}?error=${encodeURIComponent(r.error)}`);
  }
  redirect(`/r/beithady/csat/${token}?ok=1`);
}
