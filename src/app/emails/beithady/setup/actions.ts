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
 * Sends today's report to the clicker's own recipient rows only (W2 = a).
 * If the clicker's email isn't in `report_recipients`, nothing sends.
 * Always runs through the same pipeline as the cron — useful to validate
 * end-to-end before adding more recipients.
 */
export async function sendTestNowAction(): Promise<SendTestResult> {
  const me = await requireAdmin();
  const sb = supabaseAdmin();

  // The Setup page passes the clicker's username (≈ email or matching destination).
  // We look up `report_recipients` rows whose destination matches the clicker's
  // app_users.username (case-insensitive), regardless of channel — that
  // restricts the test fanout to themselves.
  const { data: meRow } = await sb
    .from('app_users')
    .select('id, username')
    .eq('id', me.id)
    .maybeSingle();
  const meRec = meRow as { id: string; username: string } | null;
  if (!meRec) return { ok: false, error: 'user_not_found' };

  const { data: rcps } = await sb
    .from('report_recipients')
    .select('id, channel, destination, display_name, active')
    .eq('report_kind', 'beithady_daily')
    .eq('active', true);
  const matching = ((rcps as Array<{
    id: string;
    channel: string;
    destination: string;
    display_name: string | null;
  }> | null) || []).filter(r => {
    const d = (r.destination || '').toLowerCase();
    const u = (meRec.username || '').toLowerCase();
    if (!u) return false;
    if (d === u) return true;
    // Allow loose match if the recipient's display_name contains the username.
    if (r.display_name && r.display_name.toLowerCase().includes(u)) return true;
    return false;
  });

  if (matching.length === 0) {
    return {
      ok: false,
      error:
        'no_matching_recipient — add a recipient row with your username/email first, then click Send Test',
    };
  }

  const result = await runDailyReport({
    trigger: 'manual_test',
    forceTimeGate: true,
    forceRebuild: true,
    restrictToRecipientIds: matching.map(r => r.id),
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
