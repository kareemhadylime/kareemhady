import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getSetting } from '@/lib/beithady/settings';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { PreArrivalTemplateRow } from './_components/template-row';
import { UpsellRow } from './_components/upsell-row';
import { OutboundKillSwitch } from './_components/outbound-killswitch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BeithadyTemplatesPage() {
  await requireBeithadyPermission('settings', 'read');
  const sb = supabaseAdmin();

  const [tplRes, upsellRes, paused, pausedReason, pausedAt] = await Promise.all([
    sb.from('beithady_pre_arrival_templates')
      .select('id, building_code, language, body, enabled, hours_before, approved_at, approved_by_user, approved_body, approver:app_users!approved_by_user(username)')
      .order('building_code', { ascending: true, nullsFirst: false }),
    sb.from('beithady_upsell_catalog')
      .select('id, sku, name, description, price_usd, enabled, approved_at, approved_by_user, approved_name, approved_description, approver:app_users!approved_by_user(username)')
      .order('display_order', { ascending: true }),
    getSetting<boolean>('beithady_outbound_paused', false),
    getSetting<string>('beithady_outbound_paused_reason', ''),
    getSetting<string>('beithady_outbound_paused_at', ''),
  ]);

  type RawTpl = {
    id: string;
    building_code: string | null;
    language: string;
    body: string;
    enabled: boolean;
    approved_at: string | null;
    approved_by_user: string | null;
    approved_body: string | null;
    approver: { username: string } | { username: string }[] | null;
  };
  const templates = ((tplRes.data as RawTpl[] | null) || []).map(t => ({
    id: t.id,
    building_code: t.building_code,
    language: t.language,
    body: t.body,
    enabled: t.enabled,
    approved_at: t.approved_at,
    approved_by_user: t.approved_by_user,
    approved_body: t.approved_body,
    approver_username: Array.isArray(t.approver) ? t.approver[0]?.username || null : t.approver?.username || null,
  }));

  type RawUpsell = {
    id: string;
    sku: string;
    name: string;
    description: string;
    price_usd: number | null;
    enabled: boolean;
    approved_at: string | null;
    approved_by_user: string | null;
    approved_name: string | null;
    approved_description: string | null;
    approver: { username: string } | { username: string }[] | null;
  };
  const upsells = ((upsellRes.data as RawUpsell[] | null) || []).map(t => ({
    id: t.id, sku: t.sku, name: t.name, description: t.description,
    price_usd: t.price_usd != null ? Number(t.price_usd) : null,
    enabled: t.enabled,
    approved_at: t.approved_at, approved_by_user: t.approved_by_user,
    approved_name: t.approved_name, approved_description: t.approved_description,
    approver_username: Array.isArray(t.approver) ? t.approver[0]?.username || null : t.approver?.username || null,
  }));

  const liveCount = templates.filter(t => t.enabled && t.approved_at && t.body === t.approved_body).length
    + upsells.filter(u => u.enabled && u.approved_at && u.name === u.approved_name && u.description === u.approved_description).length;
  const pendingCount = templates.filter(t => !t.approved_at || t.body !== t.approved_body).length
    + upsells.filter(u => !u.approved_at || u.name !== u.approved_name || u.description !== u.approved_description).length;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Templates' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Templates"
        title="Templates"
        subtitle={`${liveCount} live · ${pendingCount} pending review · every guest-facing template body must be approved by an admin before any sender can fire it.`}
      />

      <OutboundKillSwitch
        initialPaused={Boolean(paused)}
        initialReason={pausedReason || null}
        initialAt={pausedAt || null}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-heading)' }}>
          Pre-arrival templates
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-300 max-w-2xl">
          Sent ~24 h before check-in by the <code>beithady-pre-arrival</code> cron. Bodies must use only verified facts — guests treat these as authoritative. The pre-arrival cron is currently STRIPPED from <code>vercel.json</code> so even an approved + enabled template won&apos;t fire until the schedule is restored.
        </p>
        {templates.length === 0
          ? <div className="ix-card p-6 text-sm text-slate-500">No pre-arrival templates configured.</div>
          : <div className="space-y-3">{templates.map(t => <PreArrivalTemplateRow key={t.id} tpl={t} />)}</div>}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-heading)' }}>
          Upsell catalog
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-300 max-w-2xl">
          Items proposed by the <code>beithady-upsell-offer</code> cron + AI gate. Same rule: each item&apos;s name + description must be approved before it can be offered. Cron currently STRIPPED — disabled until templates are reviewed.
        </p>
        {upsells.length === 0
          ? <div className="ix-card p-6 text-sm text-slate-500">No upsell catalog items configured.</div>
          : <div className="space-y-3">{upsells.map(u => <UpsellRow key={u.id} row={u} />)}</div>}
      </section>

      <section className="ix-card p-5 space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--bh-heading)' }}>
          Other guest-facing message bodies
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-300 max-w-2xl">
          Two senders (boarding-pass link, post-stay CSAT survey) currently use <strong>hardcoded message bodies in code</strong>, not DB templates — they will be migrated to this approval workflow in a follow-up. For now they are blocked by the global Outbound Pause and have been stripped from <code>vercel.json</code>.
        </p>
        <ul className="text-xs space-y-1 ml-4 list-disc text-slate-700 dark:text-slate-200">
          <li><code>beithady-boarding-pass</code> — &ldquo;Here is your Beit Hady stay page…&rdquo; (1.5h before check-in)</li>
          <li><code>beithady-csat-survey</code> — &ldquo;Quick favour — how likely are you to recommend…&rdquo; (after check-out)</li>
          <li><code>beithady-review-reply-queue</code> — auto-replies to public reviews (manual approval only)</li>
        </ul>
      </section>
    </BeithadyShell>
  );
}
