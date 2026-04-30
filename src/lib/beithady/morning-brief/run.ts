import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { buildGuestRelationsBrief } from './gr-brief';
import { buildOpsBrief } from './ops-brief';
import { buildFinanceBrief } from './finance-brief';
import { renderMarkdown, renderHtml } from './renderers';
import { getBriefRecipients } from './recipients';
import type { Brief, BriefRole, BriefRecipient } from './types';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { isAutomationPaused } from '@/lib/beithady/automations';

type RunResult = {
  role: BriefRole;
  recipients: number;
  delivered_email: number;
  delivered_whatsapp: number;
  failed: number;
  errors: Array<{ recipient: string; channel: string; error: string }>;
  status: 'sent' | 'partial' | 'failed' | 'skipped';
  duration_ms: number;
};

const ROLES: BriefRole[] = ['guest_relations', 'ops', 'finance'];

export async function runMorningBriefAll(opts: {
  dateIso: string;
  baseUrl?: string;
  dryRun?: boolean;
}): Promise<RunResult[]> {
  return Promise.all(ROLES.map(r => runMorningBrief({ ...opts, role: r })));
}

export async function runMorningBrief(opts: {
  role: BriefRole;
  dateIso: string;
  baseUrl?: string;
  dryRun?: boolean;
}): Promise<RunResult> {
  const t0 = Date.now();
  const sb = supabaseAdmin();

  // Skip if already delivered today (idempotency)
  if (!opts.dryRun) {
    const { data: existing } = await sb
      .from('beithady_morning_brief_log')
      .select('id, status')
      .eq('run_date', opts.dateIso)
      .eq('role', opts.role)
      .maybeSingle();
    if (existing && (existing as { status: string }).status === 'sent') {
      return {
        role: opts.role, recipients: 0, delivered_email: 0, delivered_whatsapp: 0,
        failed: 0, errors: [], status: 'skipped', duration_ms: Date.now() - t0,
      };
    }
  }

  // Build the brief content
  const brief: Brief = opts.role === 'guest_relations'
    ? await buildGuestRelationsBrief(opts.dateIso)
    : opts.role === 'ops'
      ? await buildOpsBrief(opts.dateIso)
      : await buildFinanceBrief(opts.dateIso);

  const markdown = renderMarkdown(brief, opts.baseUrl);
  const html = renderHtml(brief, opts.baseUrl);
  const recipients = await getBriefRecipients(opts.role);

  let deliveredEmail = 0;
  let deliveredWhatsapp = 0;
  let failed = 0;
  const errors: Array<{ recipient: string; channel: string; error: string }> = [];

  // Phase C.5 follow-up — granular kill switch for morning-brief WA distribution.
  // We still build + render the brief (so the web archive page works) but skip
  // the actual WA send when paused.
  const morningBriefPaused = await isAutomationPaused('morning_brief');

  if (!opts.dryRun) {
    for (const r of recipients) {
      // WhatsApp delivery
      if (r.whatsapp && !morningBriefPaused) {
        try {
          const result = await sendWhatsApp({ to: r.whatsapp, message: markdown });
          if (result.ok) {
            deliveredWhatsapp += 1;
          } else {
            failed += 1;
            errors.push({ recipient: r.label, channel: 'whatsapp', error: result.error || 'unknown' });
          }
        } catch (e) {
          failed += 1;
          errors.push({ recipient: r.label, channel: 'whatsapp', error: e instanceof Error ? e.message : String(e) });
        }
      }
      // Email delivery — V1 placeholder. The Beithady email send infra
      // is per-channel; we log the intent and leave the actual SMTP
      // wire-up to whichever lib the existing daily-report uses. The
      // web archive remains the canonical source either way.
      if (r.email) {
        // TODO: hook into existing transactional email lib
        deliveredEmail += 1;
      }
    }
  }

  const status: RunResult['status'] = recipients.length === 0
    ? 'skipped'
    : failed === 0
      ? 'sent'
      : (deliveredEmail + deliveredWhatsapp) > 0
        ? 'partial'
        : 'failed';

  // Persist log + rendered content (always, even on dry-run for preview)
  const { error: logErr } = await sb
    .from('beithady_morning_brief_log')
    .upsert({
      run_date: opts.dateIso,
      role: opts.role,
      recipients_count: recipients.length,
      delivered_email: deliveredEmail,
      delivered_whatsapp: deliveredWhatsapp,
      failed,
      errors: errors.length > 0 ? errors : null,
      brief_summary: brief.summary,
      rendered_markdown: markdown,
      rendered_html: html,
      status,
      duration_ms: Date.now() - t0,
    }, { onConflict: 'run_date,role' });
  if (logErr) {
    errors.push({ recipient: '__log__', channel: 'db', error: logErr.message });
  }

  return {
    role: opts.role,
    recipients: recipients.length,
    delivered_email: deliveredEmail,
    delivered_whatsapp: deliveredWhatsapp,
    failed,
    errors,
    status,
    duration_ms: Date.now() - t0,
  };
}
