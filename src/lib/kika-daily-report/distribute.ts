import 'server-only';
import { supabaseAdmin } from '../supabase';
import { sendWhatsApp } from '../whatsapp/green-api';
import { sendHtmlEmailWithAttachment } from '../gmail';
import { XLABEL_REPORT_THEME } from '../brand-theme';
import { chipLabel } from './comparisons';
import type { KikaDailyPayload } from './types';

// Distribution. Reads `report_recipients` (filtered by `report_kind='kika_daily'`),
// sends to each recipient that hasn't yet been successfully delivered for
// the given snapshot, and records each outcome in `daily_report_deliveries`.
//
// Idempotent: a recipient row that already has `status='sent'` for this
// snapshot is skipped, so the retry-until-success cron can run every 30
// min without sending duplicates. Test mode (`restrict_to_recipient_ids`)
// bypasses the dedupe so the admin can preview repeatedly.
//
// Format:
//   WhatsApp → text-only message + tokenized link (~25 lines)
//   Email    → HTML body (X-Label hero + KIKA editorial sections) + PDF attachment

const C = XLABEL_REPORT_THEME;

const fmtEgp1 = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return 'EGP ' + Math.round(n).toLocaleString('en-US');
};

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
  const withScheme = base.startsWith('http') ? base : `https://${base}`;
  return `${withScheme.replace(/\/$/, '')}/r/kika/${encodeURIComponent(token)}`;
}

function buildWhatsAppText(payload: KikaDailyPayload, link: string): string {
  const t = payload.topline;
  const inv = payload.inventory;
  const ab = payload.abandoned;
  const f = payload.fulfillment;
  const d = payload.discounts;
  const g = payload.geo;

  const lines: string[] = [];
  lines.push('🏷️ *X-Label · KIKA · Daily Performance*');
  lines.push(payload.generated_at_cairo);
  lines.push('');

  // Anomaly callout (if any) — single most-severe line.
  if (payload.anomalies.length > 0) {
    const order = { critical: 0, warn: 1, info: 2 };
    const sorted = [...payload.anomalies].sort(
      (a, b) => order[a.severity] - order[b.severity]
    );
    lines.push(`🚨 ${sorted[0].message}`);
    lines.push('');
  }

  // Topline KPIs with comparisons
  lines.push(`💰 Net revenue: ${fmtEgp1(t.net_revenue_egp)}`);
  const dRev = t.comparisons.net_revenue;
  const dwk = chipLabel(dRev.vs_prior_day);
  const wwk = chipLabel(dRev.vs_prior_weekday);
  const mwk = chipLabel(dRev.vs_mtd_prior_month);
  lines.push(`   ${dwk} day · ${wwk} wk · ${mwk} month`);
  lines.push(
    `🛍️ Orders: ${t.orders} · AOV ${t.aov_egp !== null ? fmtEgp1(t.aov_egp) : '—'} · ${t.units} units`
  );
  if (t.unique_customers > 0) {
    const repeat =
      t.repeat_rate_pct !== null ? ` (${t.repeat_rate_pct}% repeat)` : '';
    lines.push(
      `👥 ${t.new_customers} new · ${t.returning_customers} returning${repeat}`
    );
  }
  lines.push('');

  // Top products (top 3)
  if (payload.top_products.length > 0) {
    lines.push('🔥 Top products');
    payload.top_products.slice(0, 3).forEach((p, i) => {
      const v = p.variant_label ? ` — ${p.variant_label}` : '';
      lines.push(`   ${i + 1}. ${p.title}${v} ×${p.units}`);
    });
    lines.push('');
  }

  // Inventory alerts (stockouts + low)
  if (inv.stockouts.length > 0 || inv.low.length > 0) {
    lines.push('⚠️ Inventory alerts');
    inv.stockouts.slice(0, 3).forEach(r => {
      lines.push(
        `   • ${r.title}${r.variant_label ? ` / ${r.variant_label}` : ''} — sold out`
      );
    });
    inv.low.slice(0, 3 - Math.min(3, inv.stockouts.length)).forEach(r => {
      lines.push(
        `   • ${r.title}${r.variant_label ? ` / ${r.variant_label}` : ''} — ${r.on_hand} left${r.days_of_cover !== null ? ` (~${r.days_of_cover}d cover)` : ''}`
      );
    });
    lines.push('');
  }

  // Abandoned carts
  if (ab.count > 0) {
    const recovery =
      ab.recovery_rate_pct !== null
        ? ` · ${ab.recovery_rate_pct}% recovery`
        : '';
    lines.push(
      `🛒 Abandoned: ${ab.count} carts · ${fmtEgp1(ab.recoverable_egp)} recoverable${recovery}`
    );
  }

  // Fulfillment
  if (f.fulfilled_count + f.unfulfilled_count > 0) {
    const pct =
      f.shipped_within_24h_pct !== null
        ? `${f.shipped_within_24h_pct}% <24h`
        : '—';
    const delayed =
      f.delayed_over_48h_count > 0
        ? ` · ${f.delayed_over_48h_count} delayed >48h`
        : '';
    lines.push(`📦 Fulfillment: ${pct}${delayed}`);
  }

  // Discounts
  if (d.total_orders_with_discount > 0 && d.by_code.length > 0) {
    const top = d.by_code[0];
    lines.push(
      `💸 Discounts: ${top.code} ×${top.uses} · -${fmtEgp1(d.total_discount_egp)} total`
    );
  }

  // Refunds
  if (t.refunds_egp > 0) {
    lines.push(`↩️ Refunds: ${fmtEgp1(t.refunds_egp)}`);
  }

  // Geography (top 2 countries inline)
  if (g.by_country.length > 0) {
    const tops = g.by_country
      .slice(0, 3)
      .map(c => `${c.label} ${c.pct_of_revenue.toFixed(0)}%`)
      .join(' · ');
    lines.push(`🌍 ${tops}`);
  }

  lines.push('');

  // Why-attribution chip
  payload.why.forEach(w => {
    lines.push(`💡 ${w.text}`);
  });
  if (payload.why.length > 0) lines.push('');

  // Sunday weekly snapshot
  if (payload.weekly_digest) {
    lines.push(`📅 *Weekly snapshot*`);
    lines.push(payload.weekly_digest.oneliner);
    lines.push('');
  }

  lines.push('📋 Full report (expires 48h):');
  lines.push(link);

  return lines.join('\n');
}

function buildEmailBody(payload: KikaDailyPayload, link: string): string {
  const t = payload.topline;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://kareemhady.vercel.app';
  const baseUrl = base.startsWith('http') ? base : `https://${base}`;
  const xlabelLogoUrl = `${baseUrl.replace(/\/$/, '')}/brand/xlabel/xlabel-white.png`;
  const kikaLogoUrl = `${baseUrl.replace(/\/$/, '')}/brand/xlabel/kika-black.png`;

  const fmtEgp = (n: number): string =>
    'EGP ' + Math.round(n).toLocaleString('en-US');

  // Anomaly banner (one line max)
  const anomalyHtml =
    payload.anomalies.length > 0
      ? `<tr><td style="padding:10px 24px;background:#fef2f2;border-left:4px solid ${C.downRed};font-size:12px;color:${C.ink};">
          <strong>🚨 ${payload.anomalies.length} signal${payload.anomalies.length === 1 ? '' : 's'}:</strong> ${escapeHtml(payload.anomalies[0].message)}
        </td></tr>`
      : '';

  // Top 3 products row
  const topProductsHtml = payload.top_products
    .slice(0, 3)
    .map(
      (p, i) =>
        `<tr><td style="padding:4px 0;font-size:12px;color:${C.ink};">
          <strong>${i + 1}.</strong> ${escapeHtml(p.title)}${
            p.variant_label
              ? ` <span style="color:${C.muted};">${escapeHtml(p.variant_label)}</span>`
              : ''
          } &nbsp;<span style="color:${C.muted};">×${p.units} · ${fmtEgp1(p.revenue_egp)}</span>
        </td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${C.cream};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${C.cream};">
    <tr><td style="padding:24px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:6px;overflow:hidden;border:1px solid ${C.rule};">
        <tr><td style="padding:18px 24px;background:${C.primary};text-align:left;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="vertical-align:middle;">
                <img src="${xlabelLogoUrl}" alt="X-Label" height="28" style="display:inline-block;height:28px;width:auto;vertical-align:middle;" />
                <span style="display:inline-block;border-left:1px solid rgba(255,255,255,0.3);height:24px;margin:0 12px;vertical-align:middle;"></span>
                <span style="display:inline-block;vertical-align:middle;">
                  <span style="font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">Daily Performance · KIKA</span><br/>
                  <span style="font-size:12px;color:white;font-family:Georgia,serif;">${escapeHtml(payload.generated_at_cairo)}</span>
                </span>
              </td>
              <td style="text-align:right;vertical-align:middle;">
                <span style="font-size:10px;color:rgba(255,255,255,0.6);">${escapeHtml(payload.month_label)}</span><br/>
                <span style="font-size:11px;color:rgba(255,255,255,0.85);">${escapeHtml(payload.weekday_label)}</span>
              </td>
            </tr>
          </table>
        </td></tr>
        ${anomalyHtml}
        <tr><td style="padding:14px 24px;background:${C.cream};border-left:4px solid ${C.gold};">
          <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.55;font-family:Georgia,serif;">${escapeHtml(payload.digest_oneliner)}</p>
          ${payload.why
            .map(
              w =>
                `<p style="margin:6px 0 0 0;font-size:12px;color:${C.ink2};font-style:italic;font-family:Georgia,serif;">→ ${escapeHtml(w.text)}</p>`
            )
            .join('')}
        </td></tr>
        <tr><td style="padding:18px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;font-family:Georgia,serif;">
            <tr>
              <td style="padding:6px 0;color:${C.ink2};">Net revenue</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;color:${C.ink};">${fmtEgp(t.net_revenue_egp)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:${C.ink2};">Orders / AOV / units</td>
              <td style="padding:6px 0;text-align:right;color:${C.ink};">${t.orders} / ${t.aov_egp !== null ? fmtEgp(t.aov_egp) : '—'} / ${t.units}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:${C.ink2};">Customers (new / returning)</td>
              <td style="padding:6px 0;text-align:right;color:${C.ink};">${t.unique_customers} (${t.new_customers} / ${t.returning_customers})${t.repeat_rate_pct !== null ? ` · <span style="color:${C.kikaPink};">${t.repeat_rate_pct}% repeat</span>` : ''}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:${C.ink2};">Discounts / refunds</td>
              <td style="padding:6px 0;text-align:right;color:${C.ink};">-${fmtEgp(t.discounts_egp)} / -${fmtEgp(t.refunds_egp)}</td>
            </tr>
            ${
              payload.inventory.stockouts.length + payload.inventory.low.length > 0
                ? `<tr><td style="padding:6px 0;color:${C.ink2};">Inventory alerts</td><td style="padding:6px 0;text-align:right;color:${C.downRed};font-weight:600;">${payload.inventory.stockouts.length} sold out · ${payload.inventory.low.length} low</td></tr>`
                : ''
            }
            ${
              payload.abandoned.count > 0
                ? `<tr><td style="padding:6px 0;color:${C.ink2};">Abandoned carts</td><td style="padding:6px 0;text-align:right;color:${C.ink};">${payload.abandoned.count} · ${fmtEgp1(payload.abandoned.recoverable_egp)} recoverable</td></tr>`
                : ''
            }
          </table>
        </td></tr>
        ${
          topProductsHtml
            ? `<tr><td style="padding:0 24px 14px 24px;border-top:1px solid ${C.rule};">
                  <p style="margin:14px 0 6px 0;font-size:10px;color:${C.primary};letter-spacing:1px;font-weight:bold;text-transform:uppercase;">Top products</p>
                  <table style="width:100%;font-family:Georgia,serif;">${topProductsHtml}</table>
              </td></tr>`
            : ''
        }
        ${
          payload.weekly_digest
            ? `<tr><td style="padding:14px 24px;background:${C.primary};">
                <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1px;font-weight:bold;text-transform:uppercase;">📅 Weekly snapshot</p>
                <p style="margin:4px 0 0 0;font-size:13px;color:white;line-height:1.5;font-family:Georgia,serif;">${escapeHtml(payload.weekly_digest.oneliner)}</p>
              </td></tr>`
            : ''
        }
        <tr><td style="padding:0 24px 18px 24px;text-align:center;">
          <a href="${link}" style="display:inline-block;background:${C.primary};color:white;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.5px;font-family:Georgia,serif;">View Full A4 Report</a>
          <p style="margin:10px 0 0 0;font-size:11px;color:${C.muted};font-family:Georgia,serif;">📎 Full report also attached as PDF. Browser link expires 48h after generation.</p>
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid ${C.rule};background:${C.cream};font-size:10px;color:${C.muted};text-align:center;font-family:Georgia,serif;">
          <img src="${kikaLogoUrl}" alt="KIKA" height="11" style="display:inline-block;height:11px;width:auto;vertical-align:middle;margin-right:6px;" />
          KIKA · X-Label · all amounts EGP
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pick a sender refresh-token from the existing `accounts` table. Reuses
 * the same chain as Beithady — `kareem@limeinc.cc` (preferred), else any
 * enabled account with a refresh token.
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
  const p = pref as
    | { email: string; oauth_refresh_token_encrypted: string }
    | null;
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
  const a = any as
    | { email: string; oauth_refresh_token_encrypted: string }
    | null;
  if (a?.oauth_refresh_token_encrypted) {
    return {
      refreshTokenEncrypted: a.oauth_refresh_token_encrypted,
      fromEmail: a.email,
    };
  }
  return null;
}

export async function distributeKikaReport(args: {
  snapshot_id: string;
  token: string;
  payload: KikaDailyPayload;
  pdf_bytes: Buffer;
  /** For "Send Test Now" — restricts fanout to a single recipient (the clicker). */
  restrict_to_recipient_ids?: string[] | null;
}): Promise<DistributeResult> {
  const sb = supabaseAdmin();

  // Load active KIKA recipients
  let q = sb
    .from('report_recipients')
    .select('id, channel, destination, display_name, active')
    .eq('report_kind', 'kika_daily')
    .eq('active', true);
  if (args.restrict_to_recipient_ids && args.restrict_to_recipient_ids.length > 0) {
    q = q.in('id', args.restrict_to_recipient_ids);
  }
  const { data: rcps } = await q;
  const recipients = (rcps as Recipient[] | null) || [];

  const isTestMode = !!(
    args.restrict_to_recipient_ids && args.restrict_to_recipient_ids.length > 0
  );
  // Existing successful sends → skip set (only when running as cron).
  // Test mode bypasses dedupe so the admin can resend repeatedly.
  const sentSet = new Set<string>();
  if (!isTestMode) {
    const { data: alreadySent } = await sb
      .from('daily_report_deliveries')
      .select('channel, destination')
      .eq('snapshot_id', args.snapshot_id)
      .eq('status', 'sent');
    for (const r of (alreadySent as { channel: string; destination: string }[] | null) || []) {
      sentSet.add(`${r.channel}:${(r.destination || '').toLowerCase()}`);
    }
  }

  const link = buildLinkUrl(args.token);
  const waText = buildWhatsAppText(args.payload, link);
  const emailHtml = buildEmailBody(args.payload, link);
  const subject = `KIKA Daily Performance — ${args.payload.weekday_label} ${args.payload.report_date}`;
  const filename = `KIKA_Daily_Report_${args.payload.report_date}.pdf`;

  let sender: { refreshTokenEncrypted: string; fromEmail: string } | null = null;
  const hasEmail = recipients.some(
    r =>
      r.channel === 'email' &&
      !sentSet.has(`email:${r.destination.toLowerCase()}`)
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

    const { count } = await sb
      .from('daily_report_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('snapshot_id', args.snapshot_id)
      .eq('channel', rcp.channel)
      .eq('destination', rcp.destination);
    const attempt = (count ?? 0) + 1;

    if (rcp.channel === 'whatsapp') {
      const result = await sendWhatsApp({ to: rcp.destination, message: waText });
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

  // Re-query for delivery_complete check
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
  const delivery_complete =
    recipients.length > 0 && allRcpsSent && !args.restrict_to_recipient_ids;

  return { attempted, sent, failed, skipped, errors, delivery_complete };
}

// Exported for previews/tests
export const _internal = { buildLinkUrl, buildWhatsAppText, buildEmailBody };
