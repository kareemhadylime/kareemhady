// src/app/api/cron/hr-documents-expiry/route.ts
// Daily 9 AM Cairo — HR WhatsApp digest of expiring documents + individual employee reminders.
// DST-safe: vercel.json registers UTC 06:00 + 07:00; handler gates on Cairo hour == 9.

import { NextRequest, NextResponse } from 'next/server';
import { getExpiringDocuments } from '@/lib/beithady/hr/hr-documents-queries';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { DOC_TYPE_LABELS, daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import type { DocType } from '@/lib/beithady/hr/hr-documents-types';

export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoHour(): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(f.format(new Date()));
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const hour  = cairoHour();
  if (!force && hour !== 9) {
    return NextResponse.json({ ok: true, skipped: 'not_cairo_9am', cairo_hour: hour });
  }

  try {
    const expiringDocs = await getExpiringDocuments(30);

    let digestSent = 0;
    let remindersSent = 0;

    // ── HR digest ────────────────────────────────────────────────────────────
    if (expiringDocs.length > 0) {
      const critical = expiringDocs.filter(d => {
        const days = daysUntilExpiry(d.expiry_date);
        return days !== null && days <= 7;
      });
      const warning = expiringDocs.filter(d => {
        const days = daysUntilExpiry(d.expiry_date);
        return days !== null && days > 7 && days <= 30;
      });

      let msg = '📋 *HR Documents Expiry Alert*\n\n';
      if (critical.length > 0) {
        msg += '🔴 *Critical (≤7 days):*\n';
        for (const d of critical) {
          const days = daysUntilExpiry(d.expiry_date);
          const label = days !== null && days < 0
            ? `expired ${Math.abs(days)}d ago`
            : `expires in ${days}d`;
          msg += `• ${d.employee_name} — ${DOC_TYPE_LABELS[d.doc_type as DocType]} — ${label}\n`;
        }
        msg += '\n';
      }
      if (warning.length > 0) {
        msg += '🟡 *Upcoming (8–30 days):*\n';
        for (const d of warning) {
          msg += `• ${d.employee_name} — ${DOC_TYPE_LABELS[d.doc_type as DocType]} — expires ${d.expiry_date}\n`;
        }
      }

      const hrPhones = (process.env.BEITHADY_OPS_ALERT_PHONES || '')
        .split(',')
        .map(p => p.trim().replace(/^\+/, ''))
        .filter(Boolean);

      for (const phone of hrPhones) {
        try {
          await sendWhatsApp({ to: phone, message: msg });
          digestSent++;
        } catch {
          // Log but don't fail the whole cron
        }
      }
    }

    // ── Individual employee reminders (0–7 days OR 25–30 days) ───────────────
    for (const d of expiringDocs) {
      if (!d.employee_phone) continue;
      const days = daysUntilExpiry(d.expiry_date);
      if (days === null) continue;
      const shouldRemind = (days >= 25 && days <= 30) || (days >= 0 && days <= 7);
      if (!shouldRemind) continue;

      const phone = d.employee_phone.replace(/^\+/, '');
      const typeLabel = DOC_TYPE_LABELS[d.doc_type as DocType];
      const message = `Hi ${d.employee_name}, your ${typeLabel} expires on ${d.expiry_date}. Please renew it and upload the updated document to the HR system.`;
      try {
        await sendWhatsApp({ to: phone, message });
        remindersSent++;
      } catch {
        // Log but don't fail
      }
    }

    return NextResponse.json({
      ok: true,
      expiringCount: expiringDocs.length,
      digestSent,
      remindersSent,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
