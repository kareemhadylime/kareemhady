import Link from 'next/link';
import {
  ChevronRight,
  FileDown,
  Calendar,
  ClipboardList,
  Package,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildKikaPickerReport,
  type PickerScope,
} from '@/lib/kika-picker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPES: Array<{ id: PickerScope; label: string }> = [
  { id: 'all', label: 'All open backlog' },
  { id: 'older_than_7d', label: 'Older than 7d' },
  { id: 'older_than_14d', label: 'Older than 14d' },
  { id: 'this_week', label: 'This week only' },
];

function isScope(v: string | undefined): v is PickerScope {
  return !!v && (SCOPES.map(s => s.id) as string[]).includes(v);
}

const fmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Number(n).toLocaleString('en-US');

export default async function KikaPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: PickerScope = isScope(sp.scope) ? sp.scope : 'all';
  const report = await buildKikaPickerReport({ scope });

  const pdfHref = `/api/kika/picker-report?scope=${encodeURIComponent(scope)}`;

  return (
    <>
      <TopNav>
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika/reporting" className="ix-link">Reporting</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Picker Report</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1.5">
              <ClipboardList size={12} /> KIKA · Reporting
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Picker Report</h1>
            <p className="text-sm text-slate-500 mt-1">
              Open orders grouped by SKU count · most common items in the unfulfilled backlog
            </p>
          </div>
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            <FileDown size={14} /> Export A4 PDF
          </a>
        </header>

        {/* Filter strip */}
        <section className="ix-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-indigo-600" />
            <h2 className="text-sm font-semibold">Scope</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map(s => (
              <Link
                key={s.id}
                href={s.id === 'all' ? '/emails/kika/reporting/picker' : `?scope=${s.id}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  scope === s.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </section>

        {/* Headline stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BigStat
            label="Open orders"
            value={fmt(report.totals.open_orders)}
            sub="unfulfilled · not cancelled"
            icon={<ClipboardList size={18} className="text-indigo-600" />}
          />
          <BigStat
            label="Total lines"
            value={fmt(report.totals.total_lines)}
            sub="remaining SKU instances"
            icon={<Layers size={18} className="text-amber-600" />}
          />
          <BigStat
            label="Total units"
            value={fmt(report.totals.total_units)}
            sub="physical units to pack"
            icon={<Package size={18} className="text-emerald-600" />}
          />
          <BigStat
            label="Oldest backlog"
            value={report.totals.oldest_age_days != null ? `${report.totals.oldest_age_days}d` : '—'}
            sub="since earliest open order"
            icon={<AlertTriangle size={18} className="text-rose-600" />}
          />
        </section>

        {/* TODO Task 5: BucketsBlock */}
        {/* TODO Task 6: CommonItemsBlock */}

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          Scope: {report.scope_label} · generated {new Date(report.generated_at).toLocaleString('en-US')}
        </footer>
      </main>
    </>
  );
}

function BigStat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ix-card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}
