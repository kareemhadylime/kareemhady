'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { sendHtmlEmail } from '@/lib/gmail';
import {
  buildPayablesReport,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
  type PayablePartnerRow,
} from '@/lib/financials-pnl';

function isCompanyScope(s: string): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

const RECIPIENT = 'kareem@limeinc.cc';

export type EmailPayablesResult =
  | { ok: true; recipient: string; message_id: string | null | undefined }
  | { ok: false; error: string; needs_reauth?: boolean };

// Email a formatted HTML payables report to kareem@limeinc.cc.
// `kind` picks which payables section to include (vendor or owner — the
// two surfaces the user asked for). `asOf` is the report snapshot date.
// `scope` matches the Scope tabs on the financials page.
export async function emailPayablesReport(formData: FormData): Promise<EmailPayablesResult> {
  const kind = String(formData.get('kind') || '') as 'vendor' | 'owner';
  const scopeRaw = String(formData.get('scope') || 'consolidated');
  const asOfRaw = String(formData.get('as_of') || '');
  if (kind !== 'vendor' && kind !== 'owner') {
    return { ok: false, error: 'invalid_kind' };
  }
  const scope: CompanyScope = isCompanyScope(scopeRaw) ? scopeRaw : 'consolidated';
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
    ? asOfRaw
    : new Date().toISOString().slice(0, 10);

  const companyIds = scopeCompanyIds(scope);
  const report = await buildPayablesReport({ asOf, companyIds });
  const section = kind === 'vendor' ? report.vendors : report.owners;

  const sb = supabaseAdmin();
  const { data: account } = await sb
    .from('accounts')
    .select('oauth_refresh_token_encrypted')
    .not('oauth_refresh_token_encrypted', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const token = (account as { oauth_refresh_token_encrypted: string } | null)
    ?.oauth_refresh_token_encrypted;
  if (!token) {
    return { ok: false, error: 'no_connected_gmail_account' };
  }

  const subject = `${kind === 'vendor' ? 'Vendors' : 'Owners'} Payables — ${scopeLabel(
    scope
  )} — as of ${asOf}`;
  const html = renderPayablesHtml({
    title: `${kind === 'vendor' ? 'Vendors' : 'Owners'} Payables`,
    subtitle: `${scopeLabel(scope)} · as of ${asOf}`,
    partners: section.partners,
    total: section.total,
  });

  try {
    const res = await sendHtmlEmail(token, {
      to: RECIPIENT,
      subject,
      html,
    });
    return { ok: true, recipient: RECIPIENT, message_id: res.id };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const needsReauth =
      /insufficient.*scope|invalid.*scope|403|unauthorized/i.test(msg);
    return {
      ok: false,
      error: needsReauth
        ? 'gmail_scope_missing — reconnect your Gmail account in Setup → Accounts to grant the new "send email" permission.'
        : msg.slice(0, 300),
      needs_reauth: needsReauth,
    };
  }
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inline-styled HTML table — email clients strip <style> tags so every
// visual rule must live on the element itself. Kept tight so it renders
// consistently in Gmail, Outlook, Apple Mail.
function renderPayablesHtml(args: {
  title: string;
  subtitle: string;
  partners: PayablePartnerRow[];
  total: number;
}): string {
  const rows = args.partners
    .map((p, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `<tr style="background:${bg}">
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px">${esc(p.partner_name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${fmt(p.aged_0_30)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${fmt(p.aged_30_60)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${fmt(p.aged_over_60)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmt(p.amount)}</td>
      </tr>`;
    })
    .join('');

  const totals = args.partners.reduce(
    (acc, p) => ({
      a030: acc.a030 + p.aged_0_30,
      a3060: acc.a3060 + p.aged_30_60,
      a60: acc.a60 + p.aged_over_60,
    }),
    { a030: 0, a3060: 0, a60: 0 }
  );

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:24px;background:#f8fafc">
<div style="max-width:820px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
  <h1 style="margin:0 0 4px;font-size:22px;color:#0f172a">${esc(args.title)}</h1>
  <p style="margin:0 0 18px;font-size:13px;color:#64748b">${esc(args.subtitle)} · ${args.partners.length} partners · totals in EGP</p>

  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:2px solid #0f172a;border-bottom:2px solid #0f172a">
    <thead>
      <tr style="background:#f1f5f9">
        <th style="padding:10px;text-align:left;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #cbd5e1">Name</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #cbd5e1">Aged 0–30</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #cbd5e1">Aged 30–60</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #cbd5e1">Over 60</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #cbd5e1">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#0f172a;color:#f8fafc">
        <td style="padding:10px;font-size:13px;font-weight:600">TOTAL (${args.partners.length} partners)</td>
        <td style="padding:10px;font-size:13px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums">${fmt(totals.a030)}</td>
        <td style="padding:10px;font-size:13px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums">${fmt(totals.a3060)}</td>
        <td style="padding:10px;font-size:13px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums">${fmt(totals.a60)}</td>
        <td style="padding:10px;font-size:14px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums">${fmt(args.total)}</td>
      </tr>
    </tfoot>
  </table>

  <p style="margin:20px 0 0;font-size:11px;color:#94a3b8">Generated from Odoo via Lime Investments · aging computed from posting date vs as-of date.</p>
</div>
</body></html>`;
}
