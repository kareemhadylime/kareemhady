import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Mail, MessageCircle, Trash2, Power, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import {
  addRecipientFormAction,
  toggleRecipientFormAction,
  deleteRecipientFormAction,
} from './actions';
import { SendTestPanel } from './SendTestPanel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Beithady Setup · Daily Report',
};

type Recipient = {
  id: string;
  channel: 'whatsapp' | 'email';
  destination: string;
  display_name: string | null;
  active: boolean;
  created_at: string;
};

type SnapshotPreview = {
  report_date: string;
  generated_at: string;
  delivery_complete: boolean;
  build_attempts: number;
  last_build_error: string | null;
  expires_at: string;
  token: string;
};

type Delivery = {
  channel: string;
  destination: string;
  status: string;
  error: string | null;
  sent_at: string;
  attempt: number;
};

export default async function BeithadySetupPage({
  searchParams,
}: {
  searchParams?: Promise<{ err?: string; test?: string; link?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) notFound();
  if (!me.is_admin) notFound();
  const sp = (await searchParams) || {};

  const sb = supabaseAdmin();
  const { data: rcpsData } = await sb
    .from('report_recipients')
    .select('id, channel, destination, display_name, active, created_at')
    .eq('report_kind', 'beithady_daily')
    .order('channel', { ascending: true })
    .order('created_at', { ascending: false });
  const recipients = (rcpsData as Recipient[] | null) || [];

  // Recent snapshot history (latest 5)
  const { data: snapsData } = await sb
    .from('daily_report_snapshots')
    .select(
      'report_date, generated_at, delivery_complete, build_attempts, last_build_error, expires_at, token'
    )
    .eq('report_kind', 'beithady_daily')
    .order('report_date', { ascending: false })
    .limit(5);
  const snapshots = (snapsData as SnapshotPreview[] | null) || [];

  // Today's delivery log
  const today = snapshots[0]?.report_date;
  let todayDeliveries: Delivery[] = [];
  if (today) {
    const { data: dels } = await sb
      .from('daily_report_deliveries')
      .select('channel, destination, status, error, sent_at, attempt, snapshot:daily_report_snapshots!inner(report_date)')
      .eq('snapshot.report_date', today)
      .order('sent_at', { ascending: false })
      .limit(50);
    todayDeliveries =
      ((dels as unknown as Delivery[] | null) || []).map(d => ({
        channel: d.channel,
        destination: d.destination,
        status: d.status,
        error: d.error,
        sent_at: d.sent_at,
        attempt: d.attempt,
      }));
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <TopNav />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/emails" className="hover:text-cyan-700 dark:hover:text-cyan-400">Domains</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/emails/beithady" className="hover:text-cyan-700 dark:hover:text-cyan-400">Beithady</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-700 dark:text-slate-200">Setup</span>
        </nav>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Beithady Setup</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Daily report recipients and delivery monitoring. Admin-only.
        </p>

        {/* Add recipient */}
        <section className="mt-6 ix-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
            Daily Report Recipients
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sent at 09:00 Cairo daily. WhatsApp gets a tokenized HTML link; Email gets the link plus an A4 PDF attachment. Phone numbers must include <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">+</code> and country code (e.g. <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">+201001234567</code>).
          </p>

          {sp.err && (
            <div className="mt-3 rounded-md bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              {sp.err}
            </div>
          )}
          {sp.test && (
            <div className="mt-3 rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
              Test report: {sp.test.replace('_', ' · ')}.{' '}
              {sp.link && (
                <a href={sp.link} target="_blank" rel="noreferrer" className="underline">
                  Open preview
                </a>
              )}
            </div>
          )}
          <form action={addRecipientFormAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <select
              name="channel"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              defaultValue="whatsapp"
            >
              <option value="whatsapp">📱 WhatsApp</option>
              <option value="email">📧 Email</option>
            </select>
            <input
              name="destination"
              required
              placeholder="+201001234567 or kareem@…"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              name="display_name"
              placeholder="Display name (optional)"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="md:col-span-4 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
            >
              + Add recipient
            </button>
          </form>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Destination</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 dark:text-slate-500">
                      No recipients configured yet.
                    </td>
                  </tr>
                )}
                {recipients.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4">
                      {r.channel === 'whatsapp' ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <MessageCircle className="h-3 w-3" /> WhatsApp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-cyan-50 dark:bg-cyan-950 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:text-cyan-300">
                          <Mail className="h-3 w-3" /> Email
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-900 dark:text-slate-100">{r.destination}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{r.display_name || '—'}</td>
                    <td className="py-2 pr-4">
                      {r.active ? (
                        <span className="inline-flex rounded bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <form action={toggleRecipientFormAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            title={r.active ? 'Pause' : 'Resume'}
                            className="rounded p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </form>
                        <form action={deleteRecipientFormAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            title="Remove"
                            className="rounded p-1.5 text-slate-500 dark:text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-950 hover:text-rose-700 dark:hover:text-rose-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SendTestPanel />
        </section>

        {/* Delivery monitoring */}
        <section className="mt-6 ix-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
            Recent reports
          </h2>
          {snapshots.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No reports generated yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Generated</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Last error</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => (
                  <tr key={s.report_date} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{s.report_date}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500 dark:text-slate-400">{fmtCairoDateTime(s.generated_at)}</td>
                    <td className="py-2 pr-4">
                      {s.delivery_complete ? (
                        <span className="rounded bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                          Delivered
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 dark:bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                          Retrying
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-700 dark:text-slate-200">{s.build_attempts}</td>
                    <td className="py-2 pr-4 text-xs text-rose-700 dark:text-rose-300">
                      {s.last_build_error ? s.last_build_error.slice(0, 60) + (s.last_build_error.length > 60 ? '…' : '') : '—'}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/r/beithady/${encodeURIComponent(s.token)}`}
                        target="_blank"
                        className="text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {todayDeliveries.length > 0 && (
          <section className="mt-6 ix-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
              Today&apos;s delivery log ({todayDeliveries.length})
            </h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Destination</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Attempt</th>
                  <th className="py-2 pr-4">Sent</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {todayDeliveries.map((d, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-200">{d.channel}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-900 dark:text-slate-100">{d.destination}</td>
                    <td className="py-2 pr-4">
                      {d.status === 'sent' ? (
                        <span className="rounded bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-200">sent</span>
                      ) : d.status === 'failed' ? (
                        <span className="rounded bg-rose-100 dark:bg-rose-950 px-2 py-0.5 text-xs text-rose-800 dark:text-rose-200">failed</span>
                      ) : (
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">{d.status}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-700 dark:text-slate-200">{d.attempt}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500 dark:text-slate-400">{fmtCairoDateTime(d.sent_at)}</td>
                    <td className="py-2 text-xs text-rose-700 dark:text-rose-300">
                      {d.error ? d.error.slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}

// SendTestPanel lives in its own client component file (SendTestPanel.tsx)
// for proper useActionState pending/result UX.
