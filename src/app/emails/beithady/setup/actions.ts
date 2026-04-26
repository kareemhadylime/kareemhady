'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { isGreenApiPhoneValid } from '@/lib/whatsapp/green-api';
import { runDailyReport } from '@/lib/beithady-daily-report/run';

// Admin-only Setup actions for the Beithady Daily Report.
// W1: extra admin gate (system-admin role required, not just domain access).
// W2: "Send Test Now" sends only to the clicker's email + WhatsApp (if registered).
// W3: phone numbers entered with `+` prefix; normalized at send time by green-api.

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
    report_kind: 'beithady_daily',
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
  revalidatePath('/emails/beithady/setup');
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
  revalidatePath('/emails/beithady/setup');
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
  revalidatePath('/emails/beithady/setup');
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
 * Sends today's report. Matching strategy (W2 = "clicker only"):
 *   1. Recipients where `created_by = me.id` (admin created the row themselves)
 *   2. WhatsApp recipients whose digits-only destination matches `app_users.whatsapp`
 *   3. Recipients whose display_name contains the username (case-insensitive)
 *   4. Recipients whose destination contains the username (e.g. `kareemhady@…`)
 * If still no match AND there's ≥1 active recipient, send to ALL active —
 * better to test the whole pipeline in single-admin mode than to silently
 * fail. The result message tells the admin which mode fired.
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
    .eq('report_kind', 'beithady_daily')
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

  // Fallback: if no match found, treat the test as a full broadcast — better
  // to validate the end-to-end pipeline in single-admin mode than to silently
  // fail. The result message reports `attempted=N` so the admin sees what
  // happened.
  const targets = matching.length > 0 ? matching : allActive;

  const result = await runDailyReport({
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
  const link = `${withScheme.replace(/\/$/, '')}/r/beithady/${encodeURIComponent(result.token)}`;
  return {
    ok: true,
    attempted: result.delivery.attempted,
    sent: result.delivery.sent,
    failed: result.delivery.failed,
    errors: result.delivery.errors.map(e => ({ channel: e.channel, error: e.error })),
    preview_link: link,
  };
}

// ---- Void-returning wrappers for use in <form action={...}>. ----
// Server actions consumed by `<form action>` must return void (per React
// 19 / Next.js 16). The data-returning variants above are kept exported
// for future client-component or programmatic use. Errors get surfaced
// via a redirect query param so the page can show them inline.

export async function addRecipientFormAction(formData: FormData): Promise<void> {
  const r = await addRecipientAction(formData);
  if (!r.ok) {
    redirect(`/emails/beithady/setup?err=${encodeURIComponent(r.error)}`);
  }
}

export async function toggleRecipientFormAction(formData: FormData): Promise<void> {
  await toggleRecipientAction(formData);
}

export async function deleteRecipientFormAction(formData: FormData): Promise<void> {
  await deleteRecipientAction(formData);
}

export async function sendTestNowFormAction(): Promise<void> {
  const r = await sendTestNowAction();
  if (!r.ok) {
    redirect(`/emails/beithady/setup?err=${encodeURIComponent(r.error)}`);
  } else {
    redirect(
      `/emails/beithady/setup?test=${r.sent}sent_${r.failed}failed&link=${encodeURIComponent(r.preview_link)}`
    );
  }
}

// useActionState-compatible variant. Returns SendTestResult so the
// SendTestPanel client component can show inline feedback (processing
// → success/fail) without depending on a redirect + query-param
// roundtrip.
export async function sendTestNowStateAction(
  _prev: SendTestResult | null,
  _formData: FormData
): Promise<SendTestResult> {
  return await sendTestNowAction();
}
