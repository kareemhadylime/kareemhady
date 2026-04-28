import { NextRequest, NextResponse } from 'next/server';
import { buildGuestRelationsBrief } from '@/lib/beithady/morning-brief/gr-brief';
import { buildOpsBrief } from '@/lib/beithady/morning-brief/ops-brief';
import { buildFinanceBrief } from '@/lib/beithady/morning-brief/finance-brief';
import { renderMarkdown } from '@/lib/beithady/morning-brief/renderers';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

// One-shot admin endpoint that builds today's three morning briefs and
// sends them to a single WhatsApp number for audit. Doesn't touch the
// delivery log so the daily real send still happens. Auth: CRON_SECRET.
//
// Usage:
//   GET /api/admin/beithady/send-test-briefs?to=201222109899&secret=...
//
// Returns per-role { ok, error, recipients_count, summary } objects.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoToday(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const to = (req.nextUrl.searchParams.get('to') || '').replace(/[^\d]/g, '');
  if (!to) {
    return NextResponse.json({ ok: false, error: 'missing or invalid `to` param (digits only)' }, { status: 400 });
  }

  const dateIso = req.nextUrl.searchParams.get('date') || cairoToday();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || `https://${req.headers.get('host') || 'limeinc.vercel.app'}`;

  const builders = [
    { role: 'guest_relations' as const, build: () => buildGuestRelationsBrief(dateIso) },
    { role: 'ops' as const,             build: () => buildOpsBrief(dateIso) },
    { role: 'finance' as const,         build: () => buildFinanceBrief(dateIso) },
  ];

  const results: Array<{
    role: string;
    ok: boolean;
    error?: string;
    summary?: Record<string, number>;
  }> = [];

  for (const b of builders) {
    try {
      const brief = await b.build();
      const md = renderMarkdown(brief, baseUrl);
      const r = await sendWhatsApp({ to, message: `[AUDIT TEST · ${b.role}]\n${md}` });
      results.push({
        role: b.role,
        ok: r.ok,
        error: r.ok ? undefined : (r.error || 'unknown'),
        summary: brief.summary,
      });
    } catch (e) {
      results.push({
        role: b.role,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({
    ok: allOk,
    to,
    date_iso: dateIso,
    results,
  }, { status: allOk ? 200 : 500 });
}
