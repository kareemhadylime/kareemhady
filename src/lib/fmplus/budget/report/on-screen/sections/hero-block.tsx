import { FileText } from 'lucide-react';
import type { ReportData } from '../../types';

function fmtEGP(n: number) {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

const MODE_LABELS: Record<string, string> = {
  pre: 'Pre-contract',
  signoff: 'Sign-off',
  customer: 'Customer',
  snapshot: 'Snapshot',
};

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

function KpiTile({ label, value, sub, color }: KpiTileProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-body">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 font-serif ${color ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function HeroBlock({ data }: { data: ReportData }) {
  const { contract, year, mode } = data.meta;

  const modeLabel = MODE_LABELS[mode] ?? mode;
  const statusColor = year.status === 'published' ? 'text-green-500' : 'text-amber-500';
  const statusLabel = year.status === 'published' ? 'PUBLISHED' : 'DRAFT';

  const totalHC = data.service_lines.reduce((a, s) => a + s.hc_required, 0);
  const annualCost = data.service_lines.reduce((a, s) => a + (s.monthly_cost ?? 0) * 12, 0);
  const totalGpPct = data.service_lines.reduce((a, s) => a + (s.gp_pct ?? 0), 0) / (data.service_lines.length || 1);

  return (
    <section className="relative ix-card p-6 overflow-hidden">
      {/* Brand gradient blur */}
      <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-gradient-to-br from-fmplus-yellow to-fmplus-gold opacity-[0.08] blur-3xl pointer-events-none" />

      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-fmplus-yellow/15 dark:bg-fmplus-gold/20 shrink-0">
          <FileText size={24} strokeWidth={2.2} className="text-fmplus-black dark:text-fmplus-yellow" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-fmplus-gold dark:text-fmplus-yellow font-semibold font-body">
            {modeLabel} Report
            {' · '}
            <span className={statusColor}>{statusLabel}</span>
            {year.fiscal_year ? ` · FY ${year.fiscal_year}` : ` · Y${year.year_index}`}
            {' · '}
            <span className="capitalize">{year.scenario}</span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5 font-serif truncate">
            {contract.name}
          </h1>
          {contract.customer && (
            <p className="text-sm text-slate-500 dark:text-slate-400 font-body mt-0.5">{contract.customer}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {annualCost > 0 && (
          <KpiTile
            label="Annual Cost"
            value={`${(annualCost / 1_000_000).toFixed(2)} M`}
            sub="EGP"
          />
        )}
        <KpiTile
          label="Contract Value"
          value={`${(contract.contract_value / 1_000_000).toFixed(2)} M`}
          sub="EGP / year"
        />
        {data.service_lines.some(s => s.gp_pct != null) && (
          <KpiTile
            label="Blended GP %"
            value={fmtPct(totalGpPct)}
            color={totalGpPct >= 20 ? 'text-green-500' : totalGpPct >= 10 ? 'text-amber-500' : 'text-red-500'}
          />
        )}
        <KpiTile
          label="Total HC"
          value={String(totalHC)}
          sub="headcount required"
        />
      </div>
    </section>
  );
}
