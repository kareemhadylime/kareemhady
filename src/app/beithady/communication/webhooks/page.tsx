import Link from 'next/link';
import { Webhook, CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = {
  processed: 'bg-emerald-50 text-emerald-700',
  duplicate: 'bg-slate-100 text-slate-500',
  ignored: 'bg-slate-100 text-slate-500',
  error: 'bg-rose-50 text-rose-700',
  unauthorized: 'bg-rose-100 text-rose-800',
  received: 'bg-amber-50 text-amber-700',
};

export default async function GuestyWebhooksMonitor({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; event?: string }>;
}) {
  await requireBeithadyPermission('communication', 'read');
  const sp = await searchParams;
  const sb = supabaseAdmin();

  let q = sb
    .from('guesty_webhook_events')
    .select('id, event_name, status, received_at, processed_at, error, reservation_id, conversation_id, message_id, source_ip')
    .order('received_at', { ascending: false })
    .limit(100);
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.event) q = q.eq('event_name', sp.event);

  const { data: events } = await q;

  type Row = {
    id: string; event_name: string; status: string; received_at: string;
    processed_at: string | null; error: string | null;
    reservation_id: string | null; conversation_id: string | null;
    message_id: string | null; source_ip: string | null;
  };
  const rows = (events as Row[] | null) || [];

  // Aggregate stats over the full table
  const { data: stats } = await sb
    .from('guesty_webhook_events')
    .select('status, event_name', { count: 'exact', head: false })
    .gte('received_at', new Date(Date.now() - 24 * 3600_000).toISOString());
  const last24 = (stats as Array<{ status: string; event_name: string }> | null) || [];
  const last24Total = last24.length;
  const last24Processed = last24.filter(r => r.status === 'processed').length;
  const last24Errors = last24.filter(r => r.status === 'error').length;
  const last24Unauthorized = last24.filter(r => r.status === 'unauthorized').length;

  const { data: lastEvent } = await sb
    .from('guesty_webhook_events')
    .select('received_at, event_name, status')
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRow = lastEvent as { received_at: string; event_name: string; status: string } | null;
  const lastAge = lastRow ? hoursAgo(lastRow.received_at) : null;
  const isHealthy = lastAge != null && lastAge < 24;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Communication', href: '/beithady/communication' },
        { label: 'Webhooks' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Communication · Webhooks"
        title="Guesty webhook monitor"
        subtitle="Phase O — Real-time conversation events from Guesty. Each POST persists here BEFORE processing for replay + audit."
      />

      {/* Health card */}
      <section className={`ix-card p-4 ${isHealthy ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-3">
          {isHealthy ? <CheckCircle2 size={20} className="text-emerald-600" /> : <AlertCircle size={20} className="text-amber-600" />}
          <div className="flex-1">
            <div className={`text-sm font-semibold ${isHealthy ? 'text-emerald-900' : 'text-amber-900'}`}>
              {isHealthy ? 'Webhooks healthy' : (lastRow ? 'Last event over 24h ago' : 'No webhook events yet')}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {lastRow
                ? `Last: ${lastRow.event_name} · ${lastRow.status} · ${formatAge(lastAge!)}`
                : 'Configure the webhook in Guesty and send a test event to populate this view.'}
            </div>
          </div>
          <Link
            href="https://app.guesty.com/settings/webhooks"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-cyan-700 hover:text-cyan-900 underline"
          >
            Open Guesty webhooks →
          </Link>
        </div>
      </section>

      {/* 24h stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Last 24h total" value={String(last24Total)} />
        <Stat label="Processed" value={String(last24Processed)} tone="emerald" />
        <Stat label="Errors" value={String(last24Errors)} tone={last24Errors > 0 ? 'rose' : 'neutral'} />
        <Stat label="Unauthorized" value={String(last24Unauthorized)} tone={last24Unauthorized > 0 ? 'rose' : 'neutral'} />
      </section>

      {/* Filter chips */}
      <section className="flex items-center gap-2 flex-wrap text-xs">
        <Chip href="?" active={!sp.status && !sp.event} label="All recent" />
        <Chip href="?status=processed" active={sp.status === 'processed'} label="Processed" />
        <Chip href="?status=duplicate" active={sp.status === 'duplicate'} label="Duplicate" />
        <Chip href="?status=ignored" active={sp.status === 'ignored'} label="Ignored" />
        <Chip href="?status=error" active={sp.status === 'error'} label="Errors" />
        <Chip href="?status=unauthorized" active={sp.status === 'unauthorized'} label="Unauthorized" />
        <span className="mx-2 text-slate-300">·</span>
        <Chip href="?event=reservation.messageReceived" active={sp.event === 'reservation.messageReceived'} label="Inbound msgs" />
        <Chip href="?event=reservation.messageSent" active={sp.event === 'reservation.messageSent'} label="Outbound msgs" />
      </section>

      {/* Events table */}
      <section className="ix-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Webhook size={32} className="mx-auto text-slate-300 mb-2" />
            <p>No events match this filter.</p>
            <p className="text-[10px] mt-2">
              Setup: configure the webhook URL{' '}
              <code className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                https://limeinc.vercel.app/api/webhook/guesty/conversation?secret=&lt;GUESTY_WEBHOOK_SECRET&gt;
              </code>
              {' '}in Guesty&apos;s webhook settings, subscribe to <code>reservation.messageReceived</code> and{' '}
              <code>reservation.messageSent</code>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Event</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Reservation</th>
                  <th className="text-left px-3 py-2">Conversation</th>
                  <th className="text-left px-3 py-2">Message</th>
                  <th className="text-left px-3 py-2">Latency</th>
                  <th className="text-left px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const latency = r.processed_at
                    ? Math.round((new Date(r.processed_at).getTime() - new Date(r.received_at).getTime()))
                    : null;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-[11px] text-slate-500">
                        <Clock size={10} className="inline mr-1" />
                        {new Date(r.received_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">{r.event_name}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[r.status] || 'bg-slate-100 text-slate-500'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-slate-500">
                        {r.reservation_id ? r.reservation_id.slice(0, 14) + '…' : '—'}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-slate-500">
                        {r.conversation_id ? r.conversation_id.slice(0, 14) + '…' : '—'}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-slate-500">
                        {r.message_id ? r.message_id.slice(0, 14) + '…' : '—'}
                      </td>
                      <td className="px-3 py-2 text-[10px] tabular-nums text-slate-500">
                        {latency != null ? `${latency} ms` : '—'}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-rose-700 max-w-[200px] truncate">
                        {r.error || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Setup instructions */}
      <section className="ix-card p-4 text-xs space-y-2">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: 'var(--bh-navy)' }}>
          <Eye size={14} /> Setup checklist
        </h3>
        <ol className="list-decimal pl-5 space-y-1 text-slate-600">
          <li>Set <code className="font-mono text-[10px]">GUESTY_WEBHOOK_SECRET</code> in Vercel env (any random string, e.g. <code className="font-mono text-[10px]">openssl rand -hex 32</code>).</li>
          <li>Open <a href="https://app.guesty.com/settings/webhooks" target="_blank" rel="noreferrer" className="text-cyan-700 underline">Guesty → Settings → Webhooks</a>.</li>
          <li>Create a webhook with URL{' '}
            <code className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded break-all">
              https://limeinc.vercel.app/api/webhook/guesty/conversation?secret=&lt;your secret&gt;
            </code>
          </li>
          <li>Subscribe to events: <code className="font-mono text-[10px]">reservation.messageReceived</code> + <code className="font-mono text-[10px]">reservation.messageSent</code> (start narrow; add conversation/reservation events later if needed).</li>
          <li>Send a test from Guesty&apos;s webhook UI. Refresh this page — the test event should appear within 2 seconds with status <code className="font-mono">processed</code>.</li>
          <li>Once confirmed, fire the one-time backfill (clears any pre-webhook backlog):
            <br />
            <code className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded break-all">
              curl -X POST &quot;https://limeinc.vercel.app/api/admin/guesty-backfill?secret=$CRON_SECRET&quot;
            </code>
          </li>
        </ol>
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Communication · Webhook monitor · Phase O · Auto-fires beithady_communication_ingest after every successful event
      </footer>
    </BeithadyShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' | 'neutral' }) {
  const cls = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${
      active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`}>
      {label}
    </Link>
  );
}

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${hours.toFixed(1)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
