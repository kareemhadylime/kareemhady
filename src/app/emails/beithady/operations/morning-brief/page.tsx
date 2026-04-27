import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Mail, MessageCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { runMorningBrief } from '@/lib/beithady/morning-brief/run';
import { renderHtml } from '@/lib/beithady/morning-brief/renderers';
import { buildGuestRelationsBrief } from '@/lib/beithady/morning-brief/gr-brief';
import { buildOpsBrief } from '@/lib/beithady/morning-brief/ops-brief';
import { buildFinanceBrief } from '@/lib/beithady/morning-brief/finance-brief';
import type { BriefRole } from '@/lib/beithady/morning-brief/types';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES: Array<{ value: BriefRole; label: string; emoji: string }> = [
  { value: 'guest_relations', label: 'Guest Relations', emoji: '🛎' },
  { value: 'ops',             label: 'Housekeeping & Ops', emoji: '🛠' },
  { value: 'finance',         label: 'Finance & Accounting', emoji: '💰' },
];

function isValidRole(v: string | undefined): v is BriefRole {
  return v === 'guest_relations' || v === 'ops' || v === 'finance';
}

export default async function MorningBriefArchive({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; date?: string; preview?: string }>;
}) {
  await requireBeithadyPermission('operations', 'read');
  const sp = await searchParams;
  const role: BriefRole = isValidRole(sp.role) ? sp.role : 'guest_relations';
  const date = sp.date || new Date().toISOString().slice(0, 10);
  const isPreview = sp.preview === '1';

  // Load from log if available; otherwise rebuild on the fly.
  const sb = supabaseAdmin();
  const { data: log } = await sb
    .from('beithady_morning_brief_log')
    .select('rendered_html, brief_summary, recipients_count, delivered_email, delivered_whatsapp, status, created_at')
    .eq('run_date', date)
    .eq('role', role)
    .maybeSingle();

  let html: string;
  let logRow: { recipients_count?: number; delivered_email?: number; delivered_whatsapp?: number; status?: string; created_at?: string } | null = log as null | typeof logRow;

  if (logRow && (logRow as { rendered_html?: string }).rendered_html) {
    html = (logRow as { rendered_html: string }).rendered_html;
  } else {
    // No log yet — rebuild fresh
    const brief = role === 'guest_relations'
      ? await buildGuestRelationsBrief(date)
      : role === 'ops'
        ? await buildOpsBrief(date)
        : await buildFinanceBrief(date);
    html = renderHtml(brief);
    logRow = null;
  }

  if (!html) notFound();

  // Preview = trigger a real send NOW (admin only)
  if (isPreview) {
    await runMorningBrief({ role, dateIso: date, dryRun: false });
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/emails/beithady/operations' },
      { label: 'Morning Brief' },
    ]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="Daily Morning Brief"
        subtitle={`${date} · ${ROLES.find(r => r.value === role)?.label || role}`}
      />

      {/* Role tabs */}
      <section className="ix-card p-2 flex flex-wrap items-center gap-1 text-xs">
        {ROLES.map(r => (
          <Link
            key={r.value}
            href={`?role=${r.value}&date=${date}`}
            className={`px-3 py-1.5 rounded-full inline-flex items-center gap-1
              ${role === r.value
                ? 'bg-[var(--bh-navy)] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <span>{r.emoji}</span> {r.label}
          </Link>
        ))}
        <div className="ml-auto inline-flex items-center gap-1">
          <Link
            href={`?role=${role}&date=${shiftDate(date, -1)}`}
            className="ix-btn-secondary !p-1"
            aria-label="Previous day"
          >
            <ChevronLeft size={12} />
          </Link>
          <input
            type="date"
            defaultValue={date}
            onChange={undefined /* server component, kept disabled in V1 */}
            className="ix-input !text-xs !py-0.5 !px-2"
            disabled
          />
          <Link
            href={`?role=${role}&date=${shiftDate(date, 1)}`}
            className="ix-btn-secondary !p-1"
            aria-label="Next day"
          >
            <ChevronRight size={12} />
          </Link>
        </div>
      </section>

      {/* Delivery status */}
      {logRow ? (
        <section className="ix-card p-3 text-xs flex flex-wrap items-center gap-3">
          <span className="text-slate-500">Delivered:</span>
          <span className="inline-flex items-center gap-1">
            <Mail size={12} className="text-cyan-600" />
            {(logRow as { delivered_email?: number }).delivered_email ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} className="text-emerald-600" />
            {(logRow as { delivered_whatsapp?: number }).delivered_whatsapp ?? 0}
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">
            {(logRow as { recipients_count?: number }).recipients_count ?? 0} recipients
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">{(logRow as { status?: string }).status}</span>
        </section>
      ) : (
        <section className="ix-card p-3 text-xs text-slate-500">
          Live preview — this brief has not been sent yet for {date}.
        </section>
      )}

      {/* Rendered brief */}
      <article
        className="ix-card overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </BeithadyShell>
  );
}

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
