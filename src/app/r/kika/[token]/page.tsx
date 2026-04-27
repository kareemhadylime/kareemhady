import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { ReportDocument } from '@/lib/kika-daily-report/render-html';
import type { KikaDailyPayload } from '@/lib/kika-daily-report/types';

// Tokenized public report preview (no login — proxy whitelists /r/* via
// PUBLIC_PREFIXES). The token itself is the bearer credential
// (192-bit base64url from crypto.randomBytes(24)).
//
// Validates expiry on every read so a stale link 404s even before the
// hourly cleanup cron physically clears the bytes.
//
// Returns body content only (no <html>/<body>) — root layout owns the
// document shell. Print CSS goes into a body-level <style> tag and the
// dialog/print wiring runs as a body-level <script>.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const APP_BASE = (() => {
  const b =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://kareemhady.vercel.app';
  return b.startsWith('http') ? b : `https://${b}`;
})();
const OG_IMAGE = `${APP_BASE.replace(/\/$/, '')}/brand/xlabel/kika-black.png`;

export const metadata = {
  title: 'KIKA · Daily Performance Report',
  description:
    "X-Label / KIKA daily performance digest. Confidential — link expires 48h after generation.",
  applicationName: 'KIKA',
  openGraph: {
    title: 'KIKA · Daily Performance Report',
    description: 'Daily performance metrics for the KIKA storefront.',
    type: 'website' as const,
    siteName: 'KIKA',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'KIKA',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'KIKA · Daily Performance Report',
    description: 'Daily performance metrics for the KIKA storefront.',
    images: [OG_IMAGE],
  },
  robots: { index: false, follow: false },
};

type SnapshotRow = {
  id: string;
  payload: KikaDailyPayload | null;
  expires_at: string;
  deleted_at: string | null;
  generated_at: string;
};

const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  body.kika-report-body { background: #f1f5f9 !important; margin: 0 !important; padding: 0 !important; }
  .kika-report-shell { background: white; max-width: 210mm; margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .kika-report-toolbar { padding: 12px; background: #0F172A; color: white; text-align: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .kika-report-toolbar button { padding: 8px 16px; background: #C9A961; color: #0B0B0B; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .kika-report-toolbar button:hover { background: #b89651; }
  .kika-report-toolbar .expiry { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  @media print {
    body.kika-report-body { background: white !important; }
    .kika-report-shell { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
    .kika-report-toolbar { display: none !important; }
  }
`;

const PRINT_SCRIPT = `
  (function(){
    document.body.classList.add('kika-report-body');
    var btn = document.getElementById('kika-report-print');
    if (btn) { btn.addEventListener('click', function(){ window.print(); }); }
  })();
`;

export default async function PublicKikaReportPage({
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
    .eq('report_kind', 'kika_daily')
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
      <div className="kika-report-toolbar">
        <button id="kika-report-print" type="button">
          Save as PDF / Print
        </button>
        <div className="expiry">Link expires {expiryLabel} Cairo</div>
      </div>
      <div className="kika-report-shell">
        <ReportDocument payload={snap.payload} />
      </div>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />
    </>
  );
}
