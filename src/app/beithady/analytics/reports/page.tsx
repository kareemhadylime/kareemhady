import Link from 'next/link';
import {
  TrendingUp,
  Target,
  List,
  Swords,
  PieChart,
  BarChart3,
  Plus,
  FileText,
  Calendar,
  Download,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { requireBeithadyPermission, hasBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';
import { TEMPLATE_META, type TemplateKey } from '@/lib/beithady/reports/templates';
import { DeleteButton } from './_components/DeleteButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TEMPLATE_ICON: Record<TemplateKey, typeof TrendingUp> = {
  bh_yearly: TrendingUp,
  bcg_2wk: Target,
  per_listing: List,
  building_h2h: Swords,
  channel_mix: PieChart,
  pricing_vs_market: BarChart3,
};

type SavedRow = {
  id: string;
  title: string;
  description: string | null;
  template_key: string | null;
  created_at: string;
  last_run_at: string | null;
};

export default async function ReportsLandingPage() {
  const { user } = await requireBeithadyPermission('analytics', 'read');
  const canSave = await hasBeithadyPermission(user, 'analytics', 'full');

  const sb = supabaseAdmin();
  const { data: saved } = await sb
    .from('beithady_saved_reports')
    .select('id, title, description, template_key, created_at, last_run_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const savedRows = (saved as SavedRow[] | null) || [];
  const templateKeys = Object.keys(TEMPLATE_META) as TemplateKey[];

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Generate Report' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Generate Report"
        subtitle="Build interactive dashboards with custom periods, group-by axes, and metrics. Print A4 PDF or schedule recurring email + WhatsApp delivery."
        right={
          canSave ? (
            <Link
              href="/beithady/analytics/reports/builder"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--bh-ink)] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2c4d7a] shadow-sm"
            >
              <Plus size={16} /> New report
            </Link>
          ) : null
        }
      />

      {/* Featured tile — Booking-Channel Fee Audit (1st position per Q10). */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          Featured · operator-self-serve audit
        </h2>
        <Link
          href="/beithady/analytics/reports/fees-audit"
          className="block ix-card p-6 hover:shadow-lg transition group"
          style={{
            background: 'linear-gradient(135deg, var(--bh-ink) 0%, #2c4d7a 100%)',
          }}
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-400 text-[var(--bh-ink)] flex items-center justify-center group-hover:bg-amber-300 transition">
              <Receipt size={28} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">
                  Booking-Channel Fee Audit
                </h3>
                <span className="text-[10px] uppercase tracking-wide bg-amber-400 text-[var(--bh-ink)] px-2 py-0.5 rounded font-bold">
                  <Sparkles size={10} className="inline -mt-0.5 mr-0.5" /> New
                </span>
              </div>
              <p className="text-sm text-amber-100/90 mt-1 leading-snug">
                Forward 7/14/30 day audit of every fee, tax, and stay-rule charged
                to guests across Airbnb · Booking · Other OTA · Manual.
                Cross-reference to bedrooms × bathrooms · live quote calculator ·
                channel parity check · vendor CSV export.
              </p>
              <div className="flex items-center gap-3 mt-3 text-xs text-amber-200">
                <span>📊 Heatmap</span>
                <span>·</span>
                <span>🧮 Live Calculator</span>
                <span>·</span>
                <span>🔎 Anomaly Inspector</span>
                <span>·</span>
                <span>📥 Vendor Export</span>
              </div>
            </div>
          </div>
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          Quick templates
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templateKeys.map(k => {
            const Icon = TEMPLATE_ICON[k] || FileText;
            const meta = TEMPLATE_META[k];
            return (
              <Link
                key={k}
                href={`/beithady/analytics/reports/builder?template=${k}`}
                className="ix-card p-5 hover:shadow-md transition flex flex-col gap-3 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-100">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                    {meta.title}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
                  {meta.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          Saved reports
        </h2>
        {savedRows.length === 0 ? (
          <div className="ix-card p-10 text-center text-sm text-slate-500">
            No saved reports yet. Pick a template above or click <span className="font-semibold">+ New report</span> to start from scratch.
          </div>
        ) : (
          <div className="ix-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {savedRows.map(r => (
              <SavedReportRow key={r.id} row={r} canDelete={canSave} />
            ))}
          </div>
        )}
      </section>
    </BeithadyShell>
  );
}

function SavedReportRow({ row, canDelete }: { row: SavedRow; canDelete: boolean }) {
  const lastRun = row.last_run_at
    ? new Date(row.last_run_at).toLocaleString('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'never';
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <FileText size={16} className="text-slate-400" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
          <Link
            href={`/beithady/analytics/reports/${row.id}`}
            className="hover:underline"
          >
            {row.title}
          </Link>
        </div>
        <div className="text-xs text-slate-500 truncate">
          {row.description || '—'} · last run: {lastRun}
        </div>
      </div>
      <Link
        href={`/api/beithady/reports/${row.id}/pdf`}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100"
        title="Download PDF"
      >
        <Download size={12} /> PDF
      </Link>
      <Link
        href={`/beithady/analytics/reports/${row.id}`}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        title="Schedule"
      >
        <Calendar size={12} /> Schedule
      </Link>
      {canDelete ? <DeleteButton reportId={row.id} /> : null}
    </div>
  );
}
