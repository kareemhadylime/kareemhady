import 'server-only';
import { supabaseAdmin } from '../supabase';
import { sendWhatsApp } from '../whatsapp/green-api';
import { sendHtmlEmail, sendHtmlEmailWithAttachment } from '../gmail';
import type { DailyReportPayload } from './types';

// Distribution. Reads `report_recipients`, sends to each recipient that
// has not yet been successfully delivered for the given snapshot, and
// records the result in `daily_report_deliveries`.
//
// Idempotent: a recipient row that already has a `status='sent'` delivery
// for this snapshot is skipped, so the retry-until-success cron can run
// every 30 min without sending duplicates.
//
// Format:
//   WhatsApp → text-only message containing the tokenized link
//   Email    → HTML body (digest + link) + PDF attachment

const round0 = (n: number) => Math.round(n).toLocaleString('en-US');

type Recipient = {
  id: string;
  channel: 'whatsapp' | 'email';
  destination: string;
  display_name: string | null;
  active: boolean;
};

export type DistributeResult = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ recipient_id: string; channel: string; error: string }>;
  delivery_complete: boolean;
};

function buildLinkUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';
  // VERCEL_URL has no scheme; APP_URL should include it.
  const withScheme = base.startsWith('http') ? base : `https://${base}`;
  return `${withScheme.replace(/\/$/, '')}/r/beithady/${encodeURIComponent(token)}`;
}

function buildWhatsAppText(payload: DailyReportPayload, link: string): string {
  const all = payload.all;
  const reviews = payload.reviews;
  const flagged = reviews.last_24h.filter(r => r.flagged).length;
  const pickup = all.pickup_vs_prior_month_pct;
  const arrow = pickup > 0 ? '▲ +' : pickup < 0 ? '▼ ' : '';
  const fmtUsd1 = (n: number): string => {
    if (Math.abs(n) >= 1000) return '$' + Math.round(n / 1000) + 'k';
    return '$' + Math.round(n);
  };
  return [
    `🏢 *Beithady Daily Report*`,
    payload.generated_at_cairo,
    ``,
    `📊 *Today*: ${all.occupied_today}/${all.total_units} occupied (${all.occupancy_today_pct.toFixed(1)}%)`,
    `   ✅ ${all.check_ins_today} check-ins · ${all.check_outs_today} check-outs · ${all.turnovers_today} turnovers`,
    ``,
    `💰 *MTD Revenue*: ${fmtUsd1(all.revenue_mtd_usd)}` +
      (pickup !== 0 ? ` (${arrow}${pickup.toFixed(1)}% vs prior month)` : ''),
    `⭐ ${reviews.count_mtd} reviews · ${reviews.avg_rating_mtd.toFixed(1)}★ avg` +
      (flagged > 0 ? ` · ${flagged} flagged 🚩` : ''),
    ``,
    `📋 Full report (expires 48h):`,
    link,
  ].join('\n');
}

function buildEmailBody(payload: DailyReportPayload, link: string): string {
  // Inline-styled HTML email body. Same digest as WhatsApp + a clickable
  // link to the full report. The full PDF is attached separately.
  const all = payload.all;
  const reviews = payload.reviews;
  const flagged = reviews.last_24h.filter(r => r.flagged).length;
  const pickup = all.pickup_vs_prior_month_pct;
  const fmtUsd = (n: number) => '$' + round0(n);
  const pickupStr =
    pickup === 0
      ? ''
      : pickup > 0
        ? `<span style="color:#15803d;">▲ +${pickup.toFixed(1)}% vs prior month</span>`
        : `<span style="color:#b91c1c;">▼ ${pickup.toFixed(1)}% vs prior month</span>`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9;">
    <tr><td style="padding:24px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:20px 24px;border-bottom:2px solid #0e7490;">
          <h1 style="margin:0;font-size:18px;color:#0e7490;">BEITHADY · Daily Performance</h1>
          <p style="margin:4px 0 0 0;font-size:11px;color:#64748b;">${payload.generated_at_cairo} · all amounts USD</p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#ecfeff;">
          <p style="margin:0;font-size:13px;color:#0f172a;line-height:1.5;">${payload.digest_oneliner}</p>
        </td></tr>
        <tr><td style="padding:16px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;">
            <tr><td style="padding:4px 0;color:#334155;">Occupied today</td>
                <td style="padding:4px 0;text-align:right;font-weight:600;">${all.occupied_today}/${all.total_units} (${all.occupancy_today_pct.toFixed(1)}%)</td></tr>
            <tr><td style="padding:4px 0;color:#334155;">Check-ins / Check-outs / Turnovers</td>
                <td style="padding:4px 0;text-align:right;">${all.check_ins_today} / ${all.check_outs_today} / ${all.turnovers_today}</td></tr>
            <tr><td style="padding:4px 0;color:#334155;">Revenue MTD</td>
                <td style="padding:4px 0;text-align:right;font-weight:600;">${fmtUsd(all.revenue_mtd_usd)} ${pickupStr}</td></tr>
            <tr><td style="padding:4px 0;color:#334155;">ADR MTD</td>
                <td style="padding:4px 0;text-align:right;">${fmtUsd(all.adr_mtd_usd)}</td></tr>
            <tr><td style="padding:4px 0;color:#334155;">Reviews this month</td>
                <td style="padding:4px 0;text-align:right;">${reviews.count_mtd} · ${reviews.avg_rating_mtd.toFixed(1)}★${flagged > 0 ? ` · ${flagged} flagged` : ''}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 16px 24px;">
          <a href="${link}" style="display:inline-block;background:#0e7490;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">View full A4 report (browser)</a>
          <p style="margin:8px 0 0 0;font-size:11px;color:#64748b;">📎 The full report is also attached as a PDF. Browser link expires 48h after generation.</p>
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:10px;color:#64748b;">
          Generated ${payload.generated_at_iso} · Beithady InboxOps
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Pick a sender refresh-token from the existing `accounts` table. We
 * reuse the `kareem@limeinc.cc` Gmail account that already has gmail.send
 * scope from the payables-report flow. Falls back to the first enabled
 * account with a refresh token.
 */
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
  if (p?.oauth_refresh_token_encrypted) {
    return {
      refreshTokenEncrypted: p.oauth_refresh_token_encrypted,
      fromEmail: p.email,
    };
  }
  const { data: any } = await sb
    .from('accounts')
    .select('email, oauth_refresh_token_encrypted, enabled')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();
  const a = any as { email: string; oauth_refresh_token_encrypted: string } | null;
  if (a?.oauth_refresh_token_encrypted) {
    return {
      refreshTokenEncrypted: a.oauth_refresh_token_encrypted,
      fromEmail: a.email,
    };
  }
  return null;
}

/**
 * Fanout to all active recipients for the given snapshot. Skips any
 * recipient that already has status='sent' for this snapshot. Records
 * results in `daily_report_deliveries`. Returns a summary including a
 * `delivery_complete` flag — true when every active recipient has a
 * successful send for this snapshot.
 */
export async function distributeReport(args: {
  snapshot_id: string;
  token: string;
  payload: DailyReportPayload;
  pdf_bytes: Buffer;
  // For "Send Test Now" — restricts fanout to a single recipient (the clicker).
  restrict_to_recipient_ids?: string[] | null;
}): Promise<DistributeResult> {
  const sb = supabaseAdmin();

  // Load active recipients
  let q = sb
    .from('report_recipients')
    .select('id, channel, destination, display_name, active')
    .eq('report_kind', 'beithady_daily')
    .eq('active', true);
  if (args.restrict_to_recipient_ids && args.restrict_to_recipient_ids.length > 0) {
    q = q.in('id', args.restrict_to_recipient_ids);
  }
  const { data: rcps } = await q;
  const recipients = (rcps as Recipient[] | null) || [];

  // Existing successful sends → skip set
  const { data: alreadySent } = await sb
    .from('daily_report_deliveries')
    .select('channel, destination')
    .eq('snapshot_id', args.snapshot_id)
    .eq('status', 'sent');
  const sentSet = new Set<string>();
  for (const r of (alreadySent as { channel: string; destination: string }[] | null) || []) {
    sentSet.add(`${r.channel}:${(r.destination || '').toLowerCase()}`);
  }

  const link = buildLinkUrl(args.token);
  const waText = buildWhatsAppText(args.payload, link);
  const emailHtml = buildEmailBody(args.payload, link);
  const subject = `Beithady Daily Performance — ${args.payload.generated_at_cairo.replace(' · 09:00 Cairo', '')}`;
  const filename = `Beithady_Daily_Report_${args.payload.report_date}.pdf`;

  let sender: { refreshTokenEncrypted: string; fromEmail: string } | null = null;
  // Lazy-load only if email recipients exist
  const hasEmail = recipients.some(
    r => r.channel === 'email' && !sentSet.has(`email:${r.destination.toLowerCase()}`)
  );
  if (hasEmail) sender = await getSenderRefreshToken();

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ recipient_id: string; channel: string; error: string }> = [];

  for (const rcp of recipients) {
    const key = `${rcp.channel}:${rcp.destination.toLowerCase()}`;
    if (sentSet.has(key)) {
      skipped += 1;
      continue;
    }
    attempted += 1;

    // Compute next attempt number for this destination
    const { count } = await sb
      .from('daily_report_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('snapshot_id', args.snapshot_id)
      .eq('channel', rcp.channel)
      .eq('destination', rcp.destination);
    const attempt = (count ?? 0) + 1;

    if (rcp.channel === 'whatsapp') {
      const result = await sendWhatsApp({
        to: rcp.destination,
        message: waText,
      });
      if (result.ok) {
        await sb.from('daily_report_deliveries').insert({
          snapshot_id: args.snapshot_id,
          recipient_id: rcp.id,
          channel: 'whatsapp',
          destination: rcp.destination,
          status: 'sent',
          provider_message_id: result.providerMessageId,
          attempt,
        });
        sent += 1;
      } else {
        await sb.from('daily_report_deliveries').insert({
          snapshot_id: args.snapshot_id,
          recipient_id: rcp.id,
          channel: 'whatsapp',
          destination: rcp.destination,
          status: 'failed',
          error: result.error,
          attempt,
        });
        failed += 1;
        errors.push({ recipient_id: rcp.id, channel: 'whatsapp', error: result.error });
      }
    } else {
      // email
      if (!sender) {
        await sb.from('daily_report_deliveries').insert({
          snapshot_id: args.snapshot_id,
          recipient_id: rcp.id,
          channel: 'email',
          destination: rcp.destination,
          status: 'failed',
          error: 'no_sender_account_configured',
          attempt,
        });
        failed += 1;
        errors.push({ recipient_id: rcp.id, channel: 'email', error: 'no_sender_account_configured' });
        continue;
      }
      try {
        const res = await sendHtmlEmailWithAttachment(
          sender.refreshTokenEncrypted,
          {
            to: rcp.destination,
            subject,
            html: emailHtml,
            fromEmail: sender.fromEmail,
            attachment: {
              filename,
              contentType: 'application/pdf',
              bytes: args.pdf_bytes,
            },
          }
        );
        await sb.from('daily_report_deliveries').insert({
          snapshot_id: args.snapshot_id,
          recipient_id: rcp.id,
          channel: 'email',
          destination: rcp.destination,
          status: 'sent',
          provider_message_id: res.id ?? null,
          attempt,
        });
        sent += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb.from('daily_report_deliveries').insert({
          snapshot_id: args.snapshot_id,
          recipient_id: rcp.id,
          channel: 'email',
          destination: rcp.destination,
          status: 'failed',
          error: msg.slice(0, 500),
          attempt,
        });
        failed += 1;
        errors.push({ recipient_id: rcp.id, channel: 'email', error: msg.slice(0, 500) });
      }
    }
  }

  // delivery_complete = every active recipient has a status='sent' for this snapshot.
  // Re-query because we just inserted new deliveries.
  const { data: postSent } = await sb
    .from('daily_report_deliveries')
    .select('channel, destination')
    .eq('snapshot_id', args.snapshot_id)
    .eq('status', 'sent');
  const newSentSet = new Set<string>();
  for (const r of (postSent as { channel: string; destination: string }[] | null) || []) {
    newSentSet.add(`${r.channel}:${(r.destination || '').toLowerCase()}`);
  }
  const allRcpsSent = recipients.every(rcp =>
    newSentSet.has(`${rcp.channel}:${rcp.destination.toLowerCase()}`)
  );
  const delivery_complete = recipients.length > 0 && allRcpsSent && !args.restrict_to_recipient_ids;

  return { attempted, sent, failed, skipped, errors, delivery_complete };
}

// Used by the email body and WhatsApp message tests to preview without
// sending. Exported for the Setup page's "Send Test" preview.
export const _internal = { buildLinkUrl, buildWhatsAppText, buildEmailBody };
