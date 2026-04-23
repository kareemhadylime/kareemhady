'use client';

import { useState, useTransition } from 'react';
import { X, Printer, Mail, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { emailPayablesReport } from '../actions';
import type { PayablePartnerRow } from '@/lib/financials-pnl';

type ButtonKind = 'vendor' | 'owner';

type Props = {
  kind: ButtonKind;
  title: string;
  subtitle: string;
  partners: PayablePartnerRow[];
  total: number;
  scope: string;
  asOf: string;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function PayablesDetailButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
      >
        View all {props.partners.length} partners · aging breakdown
      </button>
      {open && <PayablesModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function PayablesModal(props: Props & { onClose: () => void }) {
  const {
    title,
    subtitle,
    partners,
    total,
    scope,
    asOf,
    kind,
    onClose,
  } = props;

  const [isPending, startTransition] = useTransition();
  const [emailResult, setEmailResult] = useState<
    | null
    | { ok: true; recipient: string }
    | { ok: false; error: string; needs_reauth?: boolean }
  >(null);

  const totals = partners.reduce(
    (acc, p) => ({
      a030: acc.a030 + p.aged_0_30,
      a3060: acc.a3060 + p.aged_30_60,
      a60: acc.a60 + p.aged_over_60,
    }),
    { a030: 0, a3060: 0, a60: 0 }
  );

  // Set the document title right before printing so Chrome/Edge/Safari
  // use it as the default PDF filename (they derive "Save as" from
  // document.title by default). Restore immediately so the page header
  // stays unchanged.
  function onPrint() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const monthName = now.toLocaleString('en-US', { month: 'long' });
    const year = now.getFullYear();
    const kindWord = kind === 'vendor' ? 'Vendor' : 'Owner';
    const niceName = `Beithady_${kindWord}_Payable_${day}_${monthName}_${year}`;
    const originalTitle = document.title;
    document.title = niceName;
    // Restore after the print dialog closes. `afterprint` fires on both
    // Save-as-PDF and cancel.
    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    // Safety net — if afterprint doesn't fire (rare, some browsers),
    // restore after a short delay.
    setTimeout(restore, 2000);
  }

  function onEmail() {
    setEmailResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('kind', kind);
      fd.set('scope', scope);
      fd.set('as_of', asOf);
      const result = await emailPayablesReport(fd);
      setEmailResult(
        result.ok
          ? { ok: true, recipient: result.recipient }
          : { ok: false, error: result.error, needs_reauth: result.needs_reauth }
      );
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="payables-print-root"
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 print:border-slate-400">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {subtitle} · {partners.length} partners · totals in EGP
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
            >
              <Printer size={14} /> Print / PDF
            </button>
            <button
              type="button"
              onClick={onEmail}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-500 disabled:cursor-wait transition"
            >
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Mail size={14} /> Email to kareem@limeinc.cc
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {emailResult && (
          <div
            className={`mx-6 mt-3 p-3 rounded-lg text-sm flex items-start gap-2 print:hidden ${
              emailResult.ok
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {emailResult.ok ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            )}
            <div>
              {emailResult.ok ? (
                <span>Report emailed to {emailResult.recipient}.</span>
              ) : (
                <>
                  <div className="font-semibold">Email failed</div>
                  <div className="text-xs mt-0.5">{emailResult.error}</div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 print:overflow-visible">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 print:bg-white">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Name</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Aged 0–30</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Aged 30–60</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Over 60</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {partners.map(p => (
                <tr
                  key={p.partner_id}
                  className="border-b border-slate-100 hover:bg-slate-50 print:hover:bg-white"
                >
                  <td className="px-4 py-2">{p.partner_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {fmt(p.aged_0_30)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {fmt(p.aged_30_60)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {fmt(p.aged_over_60)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {fmt(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 text-white sticky bottom-0 print:static">
              <tr>
                <td className="px-4 py-2.5 font-semibold">TOTAL</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(totals.a030)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(totals.a3060)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(totals.a60)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-base">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <footer className="px-6 py-3 text-xs text-slate-500 border-t border-slate-200 print:border-slate-400">
          Aging computed from line posting date vs. as-of date ({asOf}). EGP.
        </footer>
      </div>

      {/* Classic print-only-this-element trick: hide everything with
          `visibility: hidden`, then re-show the print root and its
          children. Works regardless of how deep the modal is nested
          in the Next.js layout tree (which defeats display:none
          approaches since parents get hidden too). */}
      <style jsx global>{`
        @media print {
          html,
          body {
            background: #ffffff !important;
            margin: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #payables-print-root,
          #payables-print-root * {
            visibility: visible !important;
          }
          #payables-print-root {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }
          /* Let all table rows render — in-modal we have overflow:auto
             with a max-height that would clip rows when printing. */
          #payables-print-root .overflow-y-auto,
          #payables-print-root .overflow-hidden {
            overflow: visible !important;
            max-height: none !important;
            display: block !important;
          }
          /* Sticky positioning confuses page-break logic — the thead
             stayed pinned and overlapped body rows on pages 2+, which
             is what made the PDF look garbled. Force both thead/tfoot
             to static positioning; thead then repeats automatically
             at the top of each printed page via
             display:table-header-group (the browser default). */
          #payables-print-root thead,
          #payables-print-root tfoot {
            position: static !important;
          }
          #payables-print-root thead {
            display: table-header-group !important;
          }
          #payables-print-root tfoot {
            display: table-row-group !important;
          }
          /* Don't split a vendor row across two pages */
          #payables-print-root tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Preserve header tint + dark TOTAL row background on paper */
          #payables-print-root thead tr,
          #payables-print-root tfoot tr {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Chrome/Edge header + footer + date/url annotations default
             on. Users can still disable them from "More settings", but
             start clean so the PDF looks like a report. */
          @page {
            margin: 12mm 10mm;
            size: auto;
          }
        }
      `}</style>
    </div>
  );
}
