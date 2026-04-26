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

// OG metadata override — when WhatsApp scrapes the link it should show
// the Beit Hady wordmark, not the boat-rental PWA branding from the
// root manifest. Absolute image URLs only (Next.js warns on relative
// without metadataBase, and WhatsApp's scraper requires absolute).
const APP_BASE = (() => {
  const b =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'https://limeinc.vercel.app';
  return b.startsWith('http') ? b : `https://${b}`;
})();
const OG_IMAGE = `${APP_BASE.replace(/\/$/, '')}/brand/beithady/logo-stacked.jpg`;

export const metadata = {
  title: 'Beit Hady · Daily Performance Report',
  description: 'Daily operations and performance metrics for Beit Hady properties. Confidential — link expires 48h after generation.',
  applicationName: 'Beit Hady',
  openGraph: {
    title: 'Beit Hady · Daily Performance Report',
    description: 'Daily operations and performance metrics for Beit Hady properties.',
    type: 'website' as const,
    siteName: 'Beit Hady',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 1200,
        alt: 'Beit Hady',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'Beit Hady · Daily Performance Report',
    description: 'Daily operations and performance metrics for Beit Hady properties.',
    images: [OG_IMAGE],
  },
  robots: { index: false, follow: false },
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

    // v2: wire up <dialog> popouts. Buttons with data-dialog-trigger="X"
    // open dialog #X via showModal(); buttons with data-dialog-close="X"
    // close it. Falls back gracefully if the browser doesn't support
    // <dialog> (Safari < 15.4, etc.) — clicks are no-op then.
    document.querySelectorAll('[data-dialog-trigger]').forEach(function(el){
      el.addEventListener('click', function(){
        var id = el.getAttribute('data-dialog-trigger');
        var dlg = document.getElementById(id);
        if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
        else if (dlg) dlg.setAttribute('open', '');
      });
    });
    document.querySelectorAll('[data-dialog-close]').forEach(function(el){
      el.addEventListener('click', function(){
        var id = el.getAttribute('data-dialog-close');
        var dlg = document.getElementById(id);
        if (dlg && typeof dlg.close === 'function') dlg.close();
        else if (dlg) dlg.removeAttribute('open');
      });
    });
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
