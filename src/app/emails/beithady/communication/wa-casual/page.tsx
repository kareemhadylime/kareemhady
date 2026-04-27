import Link from 'next/link';
import { Smartphone, ExternalLink, Search, Activity } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { listInbox, loadThread, getInboxStats, type InboxFilter } from '@/lib/beithady/communication/inbox';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';
import { SidebarList } from '../_components/sidebar-list';
import { ThreadPane } from '../_components/thread-pane';
import type { SlaBucket } from '@/lib/beithady/communication/sla';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SearchParams = {
  c?: string;
  q?: string;
  sla?: string;
  unread?: string;
  send_error?: string;
  send_status?: string;
  fallback?: string;
  sent?: string;
};

function parseFilter(sp: SearchParams): InboxFilter {
  const f: InboxFilter = { channel: 'wa_casual' };
  if (sp.q) f.search = sp.q;
  if (sp.sla === 'red' || sp.sla === 'orange' || sp.sla === 'yellow' || sp.sla === 'green' || sp.sla === 'none') {
    f.slaBucket = sp.sla as SlaBucket;
  }
  if (sp.unread === '1') f.unreadOnly = true;
  return f;
}

export default async function WaCasualPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBeithadyPermission('communication', 'read');
  const sp = await searchParams;
  const [enabled, providerStatus] = await Promise.all([
    getProviderEnabled('green'),
    getProviderStatus('green'),
  ]);
  const configured = providerStatus.config_keys_set.length > 0 || providerStatus.has_env_fallback.length > 0;
  const ready = enabled && configured;

  const filter = parseFilter(sp);
  const [inbox, stats, thread] = await Promise.all([
    listInbox({ filter, page: 1, pageSize: 50 }),
    getInboxStats('wa_casual'),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
  ]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/emails/beithady/communication' },
      { label: 'WhatsApp Casual' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="WhatsApp Casual"
        subtitle="Casual ongoing chat via Green-API. Two-way text + voice + file. No template gating."
        right={
          <span className={`text-xs px-2 py-1 rounded font-semibold ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {ready ? '● Green-API live' : '○ Green-API not configured'}
          </span>
        }
      />

      <ChannelTabs active="wa-casual" />

      {!ready && (
        <div className="ix-card p-6 max-w-3xl mx-auto space-y-3 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 font-semibold">
            <Activity size={16} className="text-amber-600" />
            Configure Green-API to enable two-way messaging
          </div>
          <ol className="text-sm text-slate-600 dark:text-slate-300 list-decimal pl-5 space-y-1">
            <li>Create a Green-API instance at <code>console.green-api.com</code></li>
            <li>Add the credentials in <Link href="/admin/integrations" className="ix-link">/admin/integrations</Link> under provider <code>green</code></li>
            <li>Set a <code>webhook_path_slug</code> to a random string (Phase C.3 webhook handler reads this)</li>
            <li>From the Green-API console set the webhook URL to <code>https://limeinc.vercel.app/api/webhooks/green/[your-slug]</code></li>
            <li>Toggle the provider to <strong>enabled</strong> in the integrations card</li>
          </ol>
          <Link href="/admin/integrations" className="ix-btn-primary inline-flex">
            <ExternalLink size={14} /> Configure Green-API
          </Link>
        </div>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Stat label="Open" value={stats.open} />
        <Stat label="Unread" value={stats.unread} accent="rose" />
        <Stat label="🔴 > 12h" value={stats.red} accent="rose" />
        <Stat label="🟠 4-12h" value={stats.orange} accent="amber" />
        <Stat label="🟡 1-4h" value={stats.yellow} accent="yellow" />
        <Stat label="🟢 ≤ 1h" value={stats.green} accent="emerald" />
        <Stat label="Breach" value={stats.breach} accent="rose" />
      </section>

      <form className="ix-card p-3 grid grid-cols-2 lg:grid-cols-5 gap-2 text-sm">
        <input name="q" placeholder="Search guest, phone…" defaultValue={sp.q || ''} className="ix-input col-span-2" />
        <select name="sla" defaultValue={sp.sla || ''} className="ix-input">
          <option value="">Any SLA</option>
          <option value="red">🔴 Red &gt; 12h</option>
          <option value="orange">🟠 Orange 4-12h</option>
          <option value="yellow">🟡 Yellow 1-4h</option>
          <option value="green">🟢 Green ≤ 1h</option>
          <option value="none">Replied (no SLA)</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === '1'} />
          Unread only
        </label>
        <button type="submit" className="ix-btn-primary text-xs">
          <Search size={12} /> Filter
        </button>
      </form>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[640px]">
        <div className="overflow-y-auto">
          <SidebarList
            rows={inbox.rows}
            basePath="/emails/beithady/communication/wa-casual"
            selectedId={sp.c}
          />
          {inbox.total > inbox.pageSize && (
            <p className="text-[11px] text-slate-500 text-center pt-3">
              Showing {inbox.rows.length} of {inbox.total.toLocaleString()} matching.
            </p>
          )}
          {inbox.total === 0 && (
            <div className="ix-card p-8 text-center text-sm text-slate-500">
              <Smartphone size={20} className="mx-auto mb-2 text-slate-300" />
              No WhatsApp Casual conversations yet.{' '}
              {ready ? 'They appear here as soon as a guest messages your Green-API number.' : 'Configure Green-API first.'}
            </div>
          )}
        </div>
        <div className="lg:h-[640px]">
          <ThreadPane
            bundle={thread}
            composerHints={{
              send_error: sp.send_error,
              send_status: sp.send_status,
              fallback_url: sp.fallback,
              sent: sp.sent === '1',
            }}
          />
        </div>
      </section>

      <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center">
        <Smartphone size={11} /> Inbound webhook idempotent on green idMessage · voice + file via Supabase Storage → Green-API.
      </p>
    </BeithadyShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'rose' | 'amber' | 'yellow' | 'emerald' }) {
  const cls = accent === 'rose'
    ? 'text-rose-700 dark:text-rose-300'
    : accent === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : accent === 'yellow'
        ? 'text-yellow-700 dark:text-yellow-300'
        : accent === 'emerald'
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}
