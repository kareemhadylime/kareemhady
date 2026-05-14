// src/app/api/cron/hr-documents-expiry/route.ts
// Daily 9 AM Cairo — HR digest of expiring documents AND training/certs + individual reminders.
// DST-safe: vercel.json registers UTC 06:00 + 07:00; handler gates on Cairo hour == 9.

import { NextRequest, NextResponse } from 'next/server';
import { getExpiringDocuments } from '@/lib/beithady/hr/hr-documents-queries';
import { getExpiringTrainingRecords } from '@/lib/beithady/hr/hr-training-queries';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { DOC_TYPE_LABELS, daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import { RECORD_TYPE_LABELS, RECORD_TYPE_ICONS } from '@/lib/beithady/hr/hr-training-types';
import type { DocType } from '@/lib/beithady/hr/hr-documents-types';
import type { RecordType } from '@/lib/beithady/hr/hr-training-types';

export const dynamic     = 'force-dynamic';
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
    // Fetch both document and training expiry data in parallel
    const [expiringDocs, expiringTraining] = await Promise.all([
      getExpiringDocuments(30),
      getExpiringTrainingRecords(30),
    ]);

    let digestSent    = 0;
    let remindersSent = 0;

    const hasAnything = expiringDocs.length > 0 || expiringTraining.length > 0;

    // ── HR digest ────────────────────────────────────────────────────────────
    if (hasAnything) {
      let msg = '';

      // Documents section
      if (expiringDocs.length > 0) {
        const critical = expiringDocs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n <= 7; });
        const warning  = expiringDocs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n > 7 && n <= 30; });

        msg += '📋 *HR Documents Expiry Alert*\n\n';
        if (critical.length > 0) {
          msg += '🔴 *Critical (≤7 days):*\n';
          for (const d of critical) {
            const days = daysUntilExpiry(d.expiry_date);
            const label = days !== null && days < 0 ? `expired ${Math.abs(days)}d ago` : `expires in ${days}d`;
            msg += `• ${d.employee_name} — ${DOC_TYPE_LABELS[d.doc_type as DocType]} — ${label}\n`;
          }
          msg += '\n';
        }
        if (warning.length > 0) {
          msg += '🟡 *Upcoming (8–30 days):*\n';
          for (const d of warning) {
            msg += `• ${d.employee_name} — ${DOC_TYPE_LABELS[d.doc_type as DocType]} — expires ${d.expiry_date}\n`;
          }
          msg += '\n';
        }
      }

      // Training & certifications section
      if (expiringTraining.length > 0) {
        const critical = expiringTraining.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n <= 7; });
        const warning  = expiringTraining.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n > 7 && n <= 30; });

        msg += '📚 *Training & Certifications Expiry*\n\n';
        if (critical.length > 0) {
          msg += '🔴 *Critical (≤7 days):*\n';
          for (const r of critical) {
            const days = daysUntilExpiry(r.expiry_date);
            const label = days !== null && days < 0 ? `expired ${Math.abs(days)}d ago` : `expires in ${days}d`;
            const icon = RECORD_TYPE_ICONS[r.record_type as RecordType];
            msg += `• ${r.employee_name} — ${icon} ${RECORD_TYPE_LABELS[r.record_type as RecordType]}: ${r.title} — ${label}\n`;
          }
          msg += '\n';
        }
        if (warning.length > 0) {
          msg += '🟡 *Upcoming (8–30 days):*\n';
          for (const r of warning) {
            const icon = RECORD_TYPE_ICONS[r.record_type as RecordType];
            msg += `• ${r.employee_name} — ${icon} ${r.title} — expires ${r.expiry_date}\n`;
          }
        }
      }

      if (msg.trim()) {
        const hrPhones = (process.env.BEITHADY_OPS_ALERT_PHONES || '')
          .split(',')
          .map(p => p.trim().replace(/^\+/, ''))
          .filter(Boolean);

        for (const phone of hrPhones) {
          try {
            await sendWhatsApp({ to: phone, message: msg.trim() });
            digestSent++;
          } catch {
            // Log but don't fail
          }
        }
      }
    }

    // ── Individual reminders — documents ─────────────────────────────────────
    for (const d of expiringDocs) {
      if (!d.employee_phone) continue;
      const days = daysUntilExpiry(d.expiry_date);
      if (days === null) continue;
      if (!((days >= 25 && days <= 30) || (days >= 0 && days <= 7))) continue;

      const phone = d.employee_phone.replace(/^\+/, '');
      const message = `Hi ${d.employee_name}, your ${DOC_TYPE_LABELS[d.doc_type as DocType]} expires on ${d.expiry_date}. Please renew it and upload the updated document to the HR system.`;
      try { await sendWhatsApp({ to: phone, message }); remindersSent++; } catch { /* continue */ }
    }

    // ── Individual reminders — training / certifications ──────────────────────
    for (const r of expiringTraining) {
      if (!r.employee_phone) continue;
      const days = daysUntilExpiry(r.expiry_date);
      if (days === null) continue;
      if (!((days >= 25 && days <= 30) || (days >= 0 && days <= 7))) continue;

      const phone = r.employee_phone.replace(/^\+/, '');
      const icon  = RECORD_TYPE_ICONS[r.record_type as RecordType];
      const message = `Hi ${r.employee_name}, your ${icon} ${r.title} expires on ${r.expiry_date}. Please renew it and update the record in the HR system.`;
      try { await sendWhatsApp({ to: phone, message }); remindersSent++; } catch { /* continue */ }
    }

    return NextResponse.json({
      ok: true,
      expiringDocs: expiringDocs.length,
      expiringTraining: expiringTraining.length,
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
