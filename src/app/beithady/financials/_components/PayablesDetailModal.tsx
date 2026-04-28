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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build a standalone HTML document for the print window. Lives in its
// own iframe so page-break logic isn't fighting the Next.js layout tree
// or any sticky/absolute positioning the on-screen modal uses.
function buildPrintHtml(args: {
  title: string;
  subtitle: string;
  partners: PayablePartnerRow[];
  total: number;
  docTitle: string;
}): string {
  const rows = args.partners
    .map(p => {
      return `<tr>
        <td class="name">${esc(p.partner_name)}</td>
        <td class="num">${fmt(p.aged_0_30)}</td>
        <td class="num">${fmt(p.aged_30_60)}</td>
        <td class="num">${fmt(p.aged_over_60)}</td>
        <td class="num total">${fmt(p.amount)}</td>
      </tr>`;
    })
    .join('');

  const totals = args.partners.reduce(
    (acc, p) => ({
      a030: acc.a030 + p.aged_0_30,
      a3060: acc.a3060 + p.aged_30_60,
      a60: acc.a60 + p.aged_over_60,
    }),
    { a030: 0, a3060: 0, a60: 0 }
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(args.docTitle)}</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
  }
  @page {
    size: auto;
    margin: 12mm 10mm;
  }
  .header {
    padding: 0 0 14px;
    border-bottom: 2px solid #0f172a;
    margin-bottom: 12px;
  }
  .header h1 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
  }
  .header .sub {
    font-size: 12px;
    color: #64748b;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  thead {
    /* Repeats on every page */
    display: table-header-group;
  }
  tfoot {
    /* Prints once at the very end, doesn't repeat */
    display: table-row-group;
  }
  thead th {
    background: #f1f5f9;
    padding: 8px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #cbd5e1;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  thead th.num {
    text-align: right;
  }
  tbody tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  tbody tr:nth-child(even) td {
    background: #f8fafc;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  td {
    padding: 7px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  td.name {
    max-width: 0;
    word-wrap: break-word;
  }
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  td.total {
    font-weight: 600;
    color: #0f172a;
  }
  tfoot td {
    background: #0f172a;
    color: #f8fafc;
    font-weight: 700;
    padding: 10px;
    border: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  tfoot td.total {
    font-size: 12.5px;
    color: #ffffff;
  }
  .footer-note {
    margin-top: 12px;
    font-size: 10px;
    color: #94a3b8;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(args.title)}</h1>
    <div class="sub">${esc(args.subtitle)} · ${args.partners.length} partners · totals in EGP</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th class="num">Aged 0–30</th>
        <th class="num">Aged 30–60</th>
        <th class="num">Over 60</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL (${args.partners.length} partners)</td>
        <td class="num">${fmt(totals.a030)}</td>
        <td class="num">${fmt(totals.a3060)}</td>
        <td class="num">${fmt(totals.a60)}</td>
        <td class="num total">${fmt(args.total)}</td>
      </tr>
    </tfoot>
  </table>
  <p class="footer-note">Aging computed from line posting date vs. as-of date. EGP.</p>
</body>
</html>`;
}

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

  // Render the report into a hidden iframe and print *that* — completely
  // isolated from the Next.js layout tree, so no sticky/absolute
  // positioning on the outer page can bleed into the pagination. The
  // iframe's <title> becomes the default PDF "Save as" filename in
  // Chrome/Edge/Safari, so we embed our desired name there too.
  function onPrint() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const monthName = now.toLocaleString('en-US', { month: 'long' });
    const year = now.getFullYear();
    const kindWord = kind === 'vendor' ? 'Vendor' : 'Owner';
    const niceName = `Beithady_${kindWord}_Payable_${day}_${monthName}_${year}`;
    const html = buildPrintHtml({
      title,
      subtitle,
      partners,
      total,
      docTitle: niceName,
    });

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        // Chrome/Edge sometimes need focus on the iframe window before
        // print() will target it.
        win.focus();
        win.print();
      } finally {
        cleanup();
      }
    };

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
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
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {subtitle} · {partners.length} partners · totals in EGP
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            className={`mx-6 mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
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

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
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
                  className="border-b border-slate-100 hover:bg-slate-50"
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
            <tfoot className="bg-slate-900 text-white sticky bottom-0">
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

        <footer className="px-6 py-3 text-xs text-slate-500 border-t border-slate-200">
          Aging computed from line posting date vs. as-of date ({asOf}). EGP.
        </footer>
      </div>
    </div>
  );
}
