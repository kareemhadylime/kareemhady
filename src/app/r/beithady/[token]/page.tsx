import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { ReportDocument } from '@/lib/beithady-daily-report/render-html';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

// Tokenized public report preview (no login required — the proxy whitelists
// /r/* via PUBLIC_PREFIXES). The token itself is the bearer credential
// (192-bit entropy from crypto.randomBytes(24).toString('base64url')).
//
// Validates expiry on every read so a stale link 404s even before the
// hourly cleanup cron physically clears the bytes.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SnapshotRow = {
  id: string;
  payload: DailyReportPayload | null;
  expires_at: string;
  deleted_at: string | null;
  generated_at: string;
};

export default async function PublicBeithadyReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('daily_report_snapshots')
    .select('id, payload, expires_at, deleted_at, generated_at')
    .eq('token', token)
    .maybeSingle();
  const snap = data as SnapshotRow | null;

  if (!snap || snap.deleted_at || !snap.payload) notFound();
  if (new Date(snap.expires_at).getTime() < Date.now()) notFound();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Beithady Daily Report — {snap.payload.report_date}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @page { size: A4; margin: 0; }
              html, body { margin: 0; padding: 0; background: #f1f5f9; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
              .report-shell { background: white; max-width: 210mm; margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
              @media print {
                body { background: white !important; }
                .report-shell { box-shadow: none !important; margin: 0 !important; }
                .no-print { display: none !important; }
              }
            `,
          }}
        />
      </head>
      <body>
        <div
          className="no-print"
          style={{
            padding: 12,
            background: '#0f172a',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <button
            id="beithady-report-print"
            type="button"
            style={{
              padding: '8px 16px',
              background: '#0e7490',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Save as PDF / Print
          </button>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              marginTop: 6,
            }}
          >
            Link expires {new Date(snap.expires_at).toLocaleString('en-US', { timeZone: 'Africa/Cairo' })} Cairo
          </div>
        </div>
        <div className="report-shell">
          <ReportDocument payload={snap.payload} />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('beithady-report-print')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </body>
    </html>
  );
}
