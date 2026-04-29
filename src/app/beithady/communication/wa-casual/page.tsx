import Link from 'next/link';
import { Smartphone, ExternalLink, Search, Activity } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { listInbox, loadThread, getInboxStats, getArchiveTotalCount, type InboxFilter } from '@/lib/beithady/communication/inbox';
import { listActiveTemplates, getListingSecrets } from '@/lib/beithady/communication/templates';
import { buildContextFromHeader } from '@/lib/beithady/communication/templates-shared';
import { getPendingSuggestion } from '@/lib/beithady/ai/auto-reply';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';
import { SidebarList } from '../_components/sidebar-list';
import { ThreadPane } from '../_components/thread-pane';
import { MobileFullscreenLayout } from '../_components/mobile-fullscreen-layout';
import { StatLink, buildStatHref, VALID_SORTS, SORT_LABELS } from '../_components/stat-link';
import type { SlaBucket } from '@/lib/beithady/communication/sla';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_PATH = '/beithady/communication/wa-casual';

type SearchParams = {
  c?: string;
  q?: string;
  sla?: string;
  unread?: string;
  breach?: string;
  sort?: string;
  send_error?: string;
  send_status?: string;
  fallback?: string;
  sent?: string;
  // Phase C.5
  ch?: string;
  switch_revert?: string;
  switch_hint?: string;
  via?: string;
};

function parseFilter(sp: SearchParams): InboxFilter {
  const f: InboxFilter = { channel: 'wa_casual' };
  if (sp.q) f.search = sp.q;
  if (sp.sla === 'red' || sp.sla === 'orange' || sp.sla === 'yellow' || sp.sla === 'green' || sp.sla === 'none') {
    f.slaBucket = sp.sla as SlaBucket;
  }
  if (sp.unread === '1') f.unreadOnly = true;
  if (sp.breach === '1') f.breachOnly = true;
  if (sp.sort && (VALID_SORTS as readonly string[]).includes(sp.sort)) {
    f.sort = sp.sort as typeof VALID_SORTS[number];
  }
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
  const [inbox, stats, thread, pendingSuggestion, archiveCount, templates] = await Promise.all([
    listInbox({ filter, page: 1, pageSize: 50 }),
    getInboxStats('wa_casual'),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
    sp.c ? getPendingSuggestion(sp.c) : Promise.resolve(null),
    getArchiveTotalCount('wa_casual'),
    listActiveTemplates(),
  ]);

  let templateContext = undefined;
  if (thread) {
    const secrets = await getListingSecrets(thread.header.listing_id);
    templateContext = buildContextFromHeader(
      {
        guest_full_name: thread.header.guest_full_name,
        listing_nickname: thread.header.listing_nickname,
        building_code: thread.header.building_code,
      },
      { reservation: thread.reservation, secrets },
    );
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
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

      <ChannelTabs active="wa-casual" archiveCount={archiveCount} />

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
        <StatLink label="Open" value={stats.open} href={buildStatHref(BASE_PATH, sp, { sla: null, unread: null, breachOnly: null })} active={!sp.sla && sp.unread !== '1' && sp.breach !== '1'} />
        <StatLink label="Unread" value={stats.unread} accent="rose" href={buildStatHref(BASE_PATH, sp, { unread: true })} active={sp.unread === '1'} />
        <StatLink label="🔴 > 12h" value={stats.red} accent="rose" href={buildStatHref(BASE_PATH, sp, { sla: 'red' })} active={sp.sla === 'red'} />
        <StatLink label="🟠 4-12h" value={stats.orange} accent="amber" href={buildStatHref(BASE_PATH, sp, { sla: 'orange' })} active={sp.sla === 'orange'} />
        <StatLink label="🟡 1-4h" value={stats.yellow} accent="yellow" href={buildStatHref(BASE_PATH, sp, { sla: 'yellow' })} active={sp.sla === 'yellow'} />
        <StatLink label="🟢 ≤ 1h" value={stats.green} accent="emerald" href={buildStatHref(BASE_PATH, sp, { sla: 'green' })} active={sp.sla === 'green'} />
        <StatLink label="Breach" value={stats.breach} accent="rose" href={buildStatHref(BASE_PATH, sp, { breachOnly: true })} active={sp.breach === '1'} />
      </section>

      <form className="ix-card p-3 grid grid-cols-2 lg:grid-cols-6 gap-2 text-sm">
        <input name="q" placeholder="Search guest, phone…" defaultValue={sp.q || ''} className="ix-input col-span-2" />
        <select name="sla" defaultValue={sp.sla || ''} className="ix-input">
          <option value="">Any SLA</option>
          <option value="red">🔴 Red &gt; 12h</option>
          <option value="orange">🟠 Orange 4-12h</option>
          <option value="yellow">🟡 Yellow 1-4h</option>
          <option value="green">🟢 Green ≤ 1h</option>
          <option value="none">Replied (no SLA)</option>
        </select>
        <select name="sort" defaultValue={sp.sort || ''} className="ix-input" title="Sort order">
          <option value="">Sort: {SORT_LABELS.recent_inbound}</option>
          {VALID_SORTS.filter(s => s !== 'recent_inbound').map(s => (
            <option key={s} value={s}>Sort: {SORT_LABELS[s]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === '1'} />
          Unread only
        </label>
        <button type="submit" className="ix-btn-primary text-xs">
          <Search size={12} /> Filter
        </button>
      </form>

      <MobileFullscreenLayout
        selectedId={sp.c}
        basePath="/beithady/communication/wa-casual"
        sidebar={
          <>
            <SidebarList
              rows={inbox.rows}
              basePath="/beithady/communication/wa-casual"
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
          </>
        }
        threadPane={
          <ThreadPane
            bundle={thread}
            composerHints={{
              send_error: sp.send_error,
              send_status: sp.send_status,
              fallback_url: sp.fallback,
              sent: sp.sent === '1',
              switch_revert: sp.switch_revert,
              switch_hint: sp.switch_hint,
              selected_target: sp.ch as never,
              return_path: BASE_PATH,
            }}
            pendingSuggestion={pendingSuggestion}
            templates={templates}
            templateContext={templateContext}
          />
        }
      />

      <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center">
        <Smartphone size={11} /> Inbound webhook idempotent on green idMessage · voice + file via Supabase Storage → Green-API.
      </p>
    </BeithadyShell>
  );
}

