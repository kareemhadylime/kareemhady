'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';
import type { BriefRole } from '@/lib/beithady/morning-brief/types';
import { runMorningBrief } from '@/lib/beithady/morning-brief/run';
import { buildGuestRelationsBrief } from '@/lib/beithady/morning-brief/gr-brief';
import { buildOpsBrief } from '@/lib/beithady/morning-brief/ops-brief';
import { buildFinanceBrief } from '@/lib/beithady/morning-brief/finance-brief';
import { renderHtml, renderMarkdown } from '@/lib/beithady/morning-brief/renderers';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

export async function addBriefExtraAction(input: {
  role: BriefRole;
  label: string;
  email?: string;
  whatsapp?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  if (!input.label.trim()) return { ok: false, error: 'Label required' };
  if (!input.email && !input.whatsapp) return { ok: false, error: 'Email or WhatsApp required' };
  const sb = supabaseAdmin();
  const { error } = await sb.from('beithady_morning_brief_extras').insert({
    role: input.role,
    label: input.label.trim(),
    email: input.email?.trim() || null,
    whatsapp: input.whatsapp?.replace(/[^\d]/g, '') || null,
    created_by_user_id: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/morning-brief/recipients');
  return { ok: true };
}

export async function deleteBriefExtraAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { error } = await sb.from('beithady_morning_brief_extras').delete().eq('id', input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/morning-brief/recipients');
  return { ok: true };
}

export async function toggleBriefExtraAction(input: {
  id: string;
  enabled: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_morning_brief_extras')
    .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/morning-brief/recipients');
  return { ok: true };
}

// ====================================================== Test panel actions

export type TestResult = {
  ok: boolean;
  error?: string;
  duration_ms: number;
  recipients?: number;
  delivered_email?: number;
  delivered_whatsapp?: number;
  failed?: number;
  errors?: Array<{ recipient: string; channel: string; error: string }>;
  preview_html?: string;
  summary?: Record<string, number>;
};

// Build the brief without sending. Returns the rendered HTML so the
// admin can review before sending.
export async function previewBriefAction(input: {
  role: BriefRole;
  dateIso: string;
}): Promise<TestResult> {
  await requireBeithadyPermission('operations', 'full');
  const t0 = Date.now();
  try {
    const brief = input.role === 'guest_relations'
      ? await buildGuestRelationsBrief(input.dateIso)
      : input.role === 'ops'
        ? await buildOpsBrief(input.dateIso)
        : await buildFinanceBrief(input.dateIso);
    const html = renderHtml(brief);
    return {
      ok: true,
      duration_ms: Date.now() - t0,
      preview_html: html,
      summary: brief.summary,
    };
  } catch (e) {
    return {
      ok: false,
      duration_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Fire the brief NOW for all configured recipients (auto-broadcast +
// extras). Records to the delivery log; idempotency window handled in
// runMorningBrief — passing a fresh date gets re-sent.
export async function sendBriefNowAction(input: {
  role: BriefRole;
  dateIso: string;
}): Promise<TestResult> {
  await requireBeithadyPermission('operations', 'full');
  // Mark idempotency-bypass: delete any existing log row for this
  // (date, role) so runMorningBrief doesn't skip.
  const sb = supabaseAdmin();
  await sb.from('beithady_morning_brief_log')
    .delete()
    .eq('run_date', input.dateIso)
    .eq('role', input.role);
  try {
    const result = await runMorningBrief({ role: input.role, dateIso: input.dateIso });
    revalidatePath('/emails/beithady/operations/morning-brief');
    return {
      ok: result.status !== 'failed',
      duration_ms: result.duration_ms,
      recipients: result.recipients,
      delivered_email: result.delivered_email,
      delivered_whatsapp: result.delivered_whatsapp,
      failed: result.failed,
      errors: result.errors,
      error: result.status === 'failed' ? 'All deliveries failed' : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      duration_ms: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Send a test copy of the brief to JUST the calling admin's WhatsApp
// (and email if their username is email-shaped). Doesn't write to the
// delivery log so the daily real send still happens.
export async function sendTestToMeAction(input: {
  role: BriefRole;
  dateIso: string;
}): Promise<TestResult> {
  await requireBeithadyPermission('operations', 'full');
  const user = await getCurrentUser();
  if (!user) return { ok: false, duration_ms: 0, error: 'Not signed in' };
  const sb = supabaseAdmin();
  const { data: userRow } = await sb
    .from('app_users')
    .select('username, whatsapp')
    .eq('id', user.id)
    .maybeSingle();
  const u = userRow as { username: string | null; whatsapp: string | null } | null;
  const wa = u?.whatsapp ? u.whatsapp.replace(/[^\d]/g, '') : null;
  if (!wa) {
    return { ok: false, duration_ms: 0, error: 'No WhatsApp number on your user — set it in Settings → Users' };
  }

  const t0 = Date.now();
  try {
    const brief = input.role === 'guest_relations'
      ? await buildGuestRelationsBrief(input.dateIso)
      : input.role === 'ops'
        ? await buildOpsBrief(input.dateIso)
        : await buildFinanceBrief(input.dateIso);
    const md = renderMarkdown(brief);
    const result = await sendWhatsApp({ to: wa, message: `[TEST]\n${md}` });
    return {
      ok: result.ok,
      duration_ms: Date.now() - t0,
      recipients: 1,
      delivered_whatsapp: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      error: result.ok ? undefined : (result.error || 'unknown'),
      errors: result.ok ? undefined : [{ recipient: u?.username || 'me', channel: 'whatsapp', error: result.error || 'unknown' }],
    };
  } catch (e) {
    return {
      ok: false,
      duration_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
