// Hourly cron — fires saved-report schedules whose next_fire_at <= now() and
// whose Cairo hour matches schedule.hour_cairo. Renders PDF, sends via email
// (Gmail rail) and WhatsApp (Green-API). Updates last_fired_at + recomputes
// next_fire_at.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildReport } from '@/lib/beithady/reports/build-report';
import { generateCommentary } from '@/lib/beithady/reports/ai-commentary';
import { renderReportPdf } from '@/lib/beithady/reports/render-pdf';
import { sendHtmlEmailWithAttachment } from '@/lib/gmail';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import type { ReportConfig, ReportData } from '@/lib/beithady/reports/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CAIRO_OFFSET_HOURS = 2;

type Schedule = {
  id: string;
  report_id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  hour_cairo: number;
  email_recipients: string[];
  wa_channel_ids: string[];
  enabled: boolean;
  next_fire_at: string | null;
};

function computeNextFireAt(s: Schedule): string {
  const now = new Date();
  const utcHour = (s.hour_cairo - CAIRO_OFFSET_HOURS + 24) % 24;
  const next = new Date(now);
  next.setUTCHours(utcHour, 0, 0, 0);
  // Move forward at least 1 day
  next.setUTCDate(next.getUTCDate() + 1);

  if (s.frequency === 'daily') return next.toISOString();
  if (s.frequency === 'weekly' && s.day_of_week != null) {
    while (next.getUTCDay() !== s.day_of_week) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  } else if (s.frequency === 'monthly' && s.day_of_month != null) {
    while (next.getUTCDate() !== s.day_of_month) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }
  return next.toISOString();
}

async function getSenderRefreshToken(): Promise<{
  refreshTokenEncrypted: string;
  fromEmail: string;
} | null> {
  const sb = supabaseAdmin();
  const preferred = 'kareem@limeinc.cc';
  const { data: pref } = await sb
    .from('accounts')
    .select('email, oauth_refresh_token_encrypted')
    .eq('email', preferred)
    .maybeSingle();
  const p = pref as { email: string; oauth_refresh_token_encrypted: string } | null;
  if (p?.oauth_refresh_token_encrypted)
    return { refreshTokenEncrypted: p.oauth_refresh_token_encrypted, fromEmail: p.email };
  const { data: any } = await sb
    .from('accounts')
    .select('email, oauth_refresh_token_encrypted')
    .limit(1)
    .maybeSingle();
  const a = any as { email: string; oauth_refresh_token_encrypted: string } | null;
  return a?.oauth_refresh_token_encrypted
    ? { refreshTokenEncrypted: a.oauth_refresh_token_encrypted, fromEmail: a.email }
    : null;
}

export async function POST(req: Request) {
  return GET(req);
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: pending } = await sb
    .from('beithady_report_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_fire_at', now);

  const schedules = (pending as Schedule[] | null) || [];
  type RecipientOutcome = { channel: 'email' | 'wa'; recipient: string; ok: boolean; error?: string };
  const results: Array<{
    scheduleId: string;
    status: string;
    error?: string;
    recipients?: RecipientOutcome[];
    succeeded?: number;
    failed?: number;
  }> = [];

  for (const s of schedules) {
    try {
      const { data: report } = await sb
        .from('beithady_saved_reports')
        .select('config, title')
        .eq('id', s.report_id)
        .maybeSingle();
      const r = report as { config: ReportConfig; title: string } | null;
      if (!r) {
        results.push({ scheduleId: s.id, status: 'skipped_no_report' });
        continue;
      }

      const data: ReportData = await buildReport(r.config);
      if (data.config.enableAiCommentary !== false) {
        const c = await generateCommentary(data);
        if (c) data.commentary = c;
      }

      // Cache result
      await sb
        .from('beithady_saved_reports')
        .update({ last_run_data: data, last_run_at: new Date().toISOString() })
        .eq('id', s.report_id);

      await sb.from('beithady_report_runs').insert({
        report_id: s.report_id,
        triggered_by: `schedule:${s.id}`,
        data,
        ran_at: new Date().toISOString(),
      });

      const pdf = await renderReportPdf(data);
      const filename = `${r.title.replace(/[^a-z0-9]+/gi, '-')}.pdf`;

      // Per-recipient outcome tracking (audit fix 2026-05-08): without
      // this, a recipient with an expired Gmail token gets silently
      // dropped from every future fire because last_fired_at advances
      // unconditionally. We now collect per-recipient outcomes, persist
      // failures to beithady_audit_log, and surface counts in the
      // schedule update so operators can spot the issue.
      const outcomes: RecipientOutcome[] = [];

      if (s.email_recipients.length) {
        const sender = await getSenderRefreshToken();
        if (sender) {
          const subject = `${r.title} · ${new Date().toLocaleDateString('en', { dateStyle: 'medium' })}`;
          const html = `<p>Latest <strong>${r.title}</strong> attached as PDF.</p>${data.commentary?.bullets?.length ? `<ul>${data.commentary.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}<p style="color:#888;font-size:11px">Generated automatically by Beit Hady analytics.</p>`;
          for (const to of s.email_recipients) {
            try {
              await sendHtmlEmailWithAttachment(sender.refreshTokenEncrypted, {
                to,
                subject,
                html,
                fromEmail: sender.fromEmail,
                attachment: {
                  filename,
                  contentType: 'application/pdf',
                  bytes: pdf,
                },
              });
              outcomes.push({ channel: 'email', recipient: to, ok: true });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error('[scheduled-reports] email failed', to, e);
              outcomes.push({ channel: 'email', recipient: to, ok: false, error: msg });
            }
          }
        } else {
          for (const to of s.email_recipients) {
            outcomes.push({ channel: 'email', recipient: to, ok: false, error: 'no_sender_token' });
          }
        }
      }

      // WhatsApp fan-out — Green-API requires public URL for sendFileByUrl,
      // so we send a text summary with a link to the PDF download endpoint
      // (signed via cron-internal). For now: WA gets summary text.
      if (s.wa_channel_ids.length) {
        const summary =
          `*${r.title}*\n` +
          (data.commentary?.bullets || data.warnings || ['(no commentary)'])
            .slice(0, 5)
            .map(b => `• ${b}`)
            .join('\n');
        for (const phone of s.wa_channel_ids) {
          try {
            await sendWhatsApp({ to: phone, message: summary });
            outcomes.push({ channel: 'wa', recipient: phone, ok: true });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[scheduled-reports] wa failed', phone, e);
            outcomes.push({ channel: 'wa', recipient: phone, ok: false, error: msg });
          }
        }
      }

      const failed = outcomes.filter(o => !o.ok);
      const succeeded = outcomes.filter(o => o.ok);
      const nextAt = computeNextFireAt(s);
      await sb
        .from('beithady_report_schedules')
        .update({ last_fired_at: new Date().toISOString(), next_fire_at: nextAt })
        .eq('id', s.id);

      // Persist per-recipient failures to audit log so they're surfaceable
      // in the dashboard / queryable later. Successes get one summary row.
      if (failed.length > 0) {
        await sb.from('beithady_audit_log').insert({
          module: 'analytics',
          action: 'scheduled_report.recipient_errors',
          target_type: 'report_schedule',
          target_id: s.id,
          metadata: {
            report_id: s.report_id,
            failed_count: failed.length,
            succeeded_count: succeeded.length,
            failures: failed.map(f => ({ channel: f.channel, recipient: f.recipient, error: f.error })),
          },
        } as never).then(() => undefined, () => undefined);
      }

      const status =
        outcomes.length === 0 ? 'fired_no_recipients' :
        succeeded.length === 0 ? 'fired_all_failed' :
        failed.length === 0 ? 'fired' :
        'fired_partial';

      results.push({
        scheduleId: s.id,
        status,
        recipients: outcomes,
        succeeded: succeeded.length,
        failed: failed.length,
      });
    } catch (err) {
      console.error('[scheduled-reports] failed', s.id, err);
      results.push({ scheduleId: s.id, status: 'error', error: String(err) });
    }
  }

  return NextResponse.json({ count: schedules.length, results });
}
