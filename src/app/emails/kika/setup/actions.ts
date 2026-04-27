'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { isGreenApiPhoneValid } from '@/lib/whatsapp/green-api';
import { runKikaDailyReport } from '@/lib/kika-daily-report/run';

// Admin-only Setup actions for the KIKA Daily Report.
// W1: extra admin gate — system admin role required, not just KIKA domain access.
// W2: "Send Test Now" — fans out only to recipients matching the clicker
//     (display_name / destination / whatsapp digits), or to all active if
//     no match (better to validate the pipeline than silently fail).

const REPORT_KIND = 'kika_daily';

async function requireAdmin(): Promise<{ id: string; username: string }> {
  const me = await getCurrentUser();
  if (!me || !me.is_admin) {
    throw new Error('forbidden');
  }
  return { id: me.id, username: me.username };
}

function validateEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export type AddRecipientResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addRecipientAction(
  formData: FormData
): Promise<AddRecipientResult> {
  const me = await requireAdmin();
  const channelRaw = String(formData.get('channel') || '').toLowerCase();
  const destinationRaw = String(formData.get('destination') || '').trim();
  const display = String(formData.get('display_name') || '').trim();

  if (channelRaw !== 'whatsapp' && channelRaw !== 'email') {
    return { ok: false, error: 'invalid_channel' };
  }
  if (!destinationRaw) {
    return { ok: false, error: 'destination_required' };
  }
  if (channelRaw === 'whatsapp' && !isGreenApiPhoneValid(destinationRaw)) {
    return { ok: false, error: 'invalid_phone (use + and country code)' };
  }
  if (channelRaw === 'email' && !validateEmail(destinationRaw)) {
    return { ok: false, error: 'invalid_email' };
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from('report_recipients').insert({
    report_kind: REPORT_KIND,
    channel: channelRaw,
    destination: destinationRaw,
    display_name: display || null,
    active: true,
    created_by: me.id,
  });
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'already_exists' };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath('/emails/kika/setup');
  return { ok: true };
}

export async function toggleRecipientAction(
  formData: FormData
): Promise<{ ok: boolean }> {
  await requireAdmin();
  const id = String(formData.get('id') || '');
  if (!id) return { ok: false };
  const sb = supabaseAdmin();
  const { data: cur } = await sb
    .from('report_recipients')
    .select('active')
    .eq('id', id)
    .maybeSingle();
  const c = cur as { active: boolean } | null;
  if (!c) return { ok: false };
  await sb
    .from('report_recipients')
    .update({ active: !c.active, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/emails/kika/setup');
  return { ok: true };
}

export async function deleteRecipientAction(
  formData: FormData
): Promise<{ ok: boolean }> {
  await requireAdmin();
  const id = String(formData.get('id') || '');
  if (!id) return { ok: false };
  const sb = supabaseAdmin();
  await sb.from('report_recipients').delete().eq('id', id);
  revalidatePath('/emails/kika/setup');
  return { ok: true };
}

export type SendTestResult =
  | {
      ok: true;
      attempted: number;
      sent: number;
      failed: number;
      errors: Array<{ channel: string; error: string }>;
      preview_link: string;
    }
  | { ok: false; error: string };

/**
 * Sends today's report. Matching strategy (W2 = clicker-only):
 *   1. Recipients where `created_by = me.id`
 *   2. WhatsApp recipients whose digits-only destination matches `app_users.whatsapp`
 *   3. Recipients whose display_name contains the username (case-insensitive)
 *   4. Recipients whose destination contains the username
 * Fallback: if no match, broadcast to ALL active — better to validate the
 * pipeline than silently fail. The result tells the admin which mode fired.
 */
export async function sendTestNowAction(): Promise<SendTestResult> {
  const me = await requireAdmin();
  const sb = supabaseAdmin();

  const { data: meRow } = await sb
    .from('app_users')
    .select('id, username, whatsapp')
    .eq('id', me.id)
    .maybeSingle();
  const meRec = meRow as {
    id: string;
    username: string;
    whatsapp: string | null;
  } | null;
  if (!meRec) return { ok: false, error: 'user_not_found' };

  const username = (meRec.username || '').toLowerCase();
  const myWhatsAppDigits = (meRec.whatsapp || '').replace(/[^0-9]/g, '');

  const { data: rcps } = await sb
    .from('report_recipients')
    .select('id, channel, destination, display_name, active, created_by')
    .eq('report_kind', REPORT_KIND)
    .eq('active', true);
  const allActive = (rcps as Array<{
    id: string;
    channel: string;
    destination: string;
    display_name: string | null;
    created_by: string | null;
  }> | null) || [];

  if (allActive.length === 0) {
    return {
      ok: false,
      error: 'no_active_recipients — add at least one recipient first',
    };
  }

  const matching = allActive.filter(r => {
    if (r.created_by === meRec.id) return true;
    const dest = (r.destination || '').toLowerCase();
    const dn = (r.display_name || '').toLowerCase();
    if (r.channel === 'whatsapp' && myWhatsAppDigits) {
      const recipientDigits = (r.destination || '').replace(/[^0-9]/g, '');
      if (recipientDigits === myWhatsAppDigits) return true;
    }
    if (username) {
      if (dest.includes(username)) return true;
      if (dn.includes(username)) return true;
    }
    return false;
  });

  const targets = matching.length > 0 ? matching : allActive;

  const result = await runKikaDailyReport({
    trigger: 'manual_test',
    forceTimeGate: true,
    forceRebuild: true,
    restrictToRecipientIds: targets.map(r => r.id),
  });
  if (!result.ok) {
    return { ok: false, error: `${result.phase}: ${result.error}` };
  }
  if (result.status === 'skipped_pre_9am' || result.status === 'already_complete') {
    return { ok: false, error: result.status };
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';
  const withScheme = base.startsWith('http') ? base : `https://${base}`;
  const link = `${withScheme.replace(/\/$/, '')}/r/kika/${encodeURIComponent(result.token)}`;
  return {
    ok: true,
    attempted: result.delivery.attempted,
    sent: result.delivery.sent,
    failed: result.delivery.failed,
    errors: result.delivery.errors.map(e => ({
      channel: e.channel,
      error: e.error,
    })),
    preview_link: link,
  };
}

// ---- Void-returning wrappers for use in <form action={...}>. ----

export async function addRecipientFormAction(formData: FormData): Promise<void> {
  const r = await addRecipientAction(formData);
  if (!r.ok) {
    redirect(`/emails/kika/setup?err=${encodeURIComponent(r.error)}`);
  }
}

export async function toggleRecipientFormAction(
  formData: FormData
): Promise<void> {
  await toggleRecipientAction(formData);
}

export async function deleteRecipientFormAction(
  formData: FormData
): Promise<void> {
  await deleteRecipientAction(formData);
}

// useActionState-compatible variant for the inline SendTestPanel UX.
export async function sendTestNowStateAction(
  _prev: SendTestResult | null,
  _formData: FormData
): Promise<SendTestResult> {
  return await sendTestNowAction();
}
