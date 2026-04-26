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
//
// IMPORTANT: this page does NOT return its own <html>/<body> — that
// would conflict with the root layout's <html>, browsers would strip
// the duplicate, and inline scripts (like the print button binding)
// wouldn't fire. Instead we return body content only and rely on the
// root layout for the document shell. Print CSS goes into a body-level
// <style> tag.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = {
  title: 'Beithady Daily Report',
};

type SnapshotRow = {
  id: string;
  payload: DailyReportPayload | null;
  expires_at: string;
  deleted_at: string | null;
  generated_at: string;
};

const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  body.beithady-report-body { background: #f1f5f9 !important; margin: 0 !important; padding: 0 !important; }
  .beithady-report-shell { background: white; max-width: 210mm; margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .beithady-report-toolbar { padding: 12px; background: #0f172a; color: white; text-align: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .beithady-report-toolbar button { padding: 8px 16px; background: #0e7490; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .beithady-report-toolbar button:hover { background: #155e75; }
  .beithady-report-toolbar .expiry { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  @media print {
    body.beithady-report-body { background: white !important; }
    .beithady-report-shell { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
    .beithady-report-toolbar { display: none !important; }
  }
`;

const PRINT_SCRIPT = `
  (function(){
    document.body.classList.add('beithady-report-body');
    var btn = document.getElementById('beithady-report-print');
    if (btn) { btn.addEventListener('click', function(){ window.print(); }); }
  })();
`;

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

  const expiryLabel = new Date(snap.expires_at).toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="beithady-report-toolbar">
        <button id="beithady-report-print" type="button">
          Save as PDF / Print
        </button>
        <div className="expiry">Link expires {expiryLabel} Cairo</div>
      </div>
      <div className="beithady-report-shell">
        <ReportDocument payload={snap.payload} />
      </div>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />
    </>
  );
}
