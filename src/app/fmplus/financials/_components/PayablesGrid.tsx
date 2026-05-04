import { Wrench, Users, Landmark, Building2, HandCoins, Banknote, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FmplusPayablesReport, PayablesBucket } from '@/lib/fmplus/payables';

const fmt = (n: number): string => {
  const v = Number(n) || 0;
  return Math.abs(v) < 0.5 ? '0' : Math.round(v).toLocaleString('en-US');
};

type Tone = 'amber' | 'indigo' | 'rose' | 'slate' | 'emerald' | 'cyan' | 'violet';

const TONE: Record<Tone, {
  iconBg: string;
  iconText: string;
  gradFrom: string;
  gradTo: string;
  badge: string;
  border: string;
}> = {
  amber:   { iconBg: 'bg-amber-50 dark:bg-amber-950',     iconText: 'text-amber-700 dark:text-amber-300',     gradFrom: 'from-amber-400',   gradTo: 'to-amber-600',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',         border: 'hover:border-amber-400' },
  indigo:  { iconBg: 'bg-indigo-50 dark:bg-indigo-950',   iconText: 'text-indigo-700 dark:text-indigo-300',   gradFrom: 'from-indigo-400',  gradTo: 'to-indigo-600',  badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',     border: 'hover:border-indigo-400' },
  rose:    { iconBg: 'bg-rose-50 dark:bg-rose-950',       iconText: 'text-rose-700 dark:text-rose-300',       gradFrom: 'from-rose-400',    gradTo: 'to-rose-600',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',             border: 'hover:border-rose-400' },
  slate:   { iconBg: 'bg-slate-100 dark:bg-slate-800',    iconText: 'text-slate-700 dark:text-slate-300',     gradFrom: 'from-slate-400',   gradTo: 'to-slate-600',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',         border: 'hover:border-slate-400' },
  emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-700 dark:text-emerald-300', gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', border: 'hover:border-emerald-400' },
  cyan:    { iconBg: 'bg-cyan-50 dark:bg-cyan-950',       iconText: 'text-cyan-700 dark:text-cyan-300',       gradFrom: 'from-cyan-400',    gradTo: 'to-cyan-600',    badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',             border: 'hover:border-cyan-400' },
  violet:  { iconBg: 'bg-violet-50 dark:bg-violet-950',   iconText: 'text-violet-700 dark:text-violet-300',   gradFrom: 'from-violet-400',  gradTo: 'to-violet-600',  badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',     border: 'hover:border-violet-400' },
};

type Spec = {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: Tone;
  bucket: PayablesBucket;
  unitLabel: string;
};

export function PayablesGrid({ report }: { report: FmplusPayablesReport }) {
  const payables: Spec[] = [
    { title: 'Vendors Payables',     subtitle: 'Suppliers, subcontractors, accruals',     Icon: Wrench,    tone: 'amber',  bucket: report.vendors,             unitLabel: 'partners' },
    { title: 'Employee Payables',    subtitle: 'Salaries, allowances, settlements',       Icon: Users,     tone: 'indigo', bucket: report.employees,           unitLabel: 'employees' },
    { title: 'Government Payables',  subtitle: 'Tax, social insurance, customs, levies',  Icon: Landmark,  tone: 'rose',   bucket: report.government_payables, unitLabel: 'authorities' },
    { title: 'Bank & Financing',     subtitle: 'Loans, leases, factoring, notes',         Icon: Building2, tone: 'slate',  bucket: report.bank_financing,      unitLabel: 'creditors' },
  ];
  const receivables: Spec[] = [
    { title: 'Customer Receivables',    subtitle: 'Open AR — invoiced but unpaid',         Icon: HandCoins, tone: 'emerald', bucket: report.customer_receivables,   unitLabel: 'customers' },
    { title: 'Customer Deposits & LGs', subtitle: 'Deposits held with customers + LGs',    Icon: Banknote,  tone: 'cyan',    bucket: report.customer_deposits,      unitLabel: 'customers' },
    { title: 'Government Receivables',  subtitle: 'WHT credit owed back by tax authority', Icon: Receipt,   tone: 'violet',  bucket: report.government_receivables, unitLabel: 'authorities' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader label="Payables" subtitle="Money we owe — operational and financial" tone="rose" />
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {payables.map(s => <Card key={s.title} {...s} />)}
      </section>

      <SectionHeader label="Receivables" subtitle="Money owed to us — customer and tax credits" tone="emerald" />
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {receivables.map(s => <Card key={s.title} {...s} />)}
      </section>
    </div>
  );
}

function SectionHeader({ label, subtitle, tone }: { label: string; subtitle: string; tone: 'rose' | 'emerald' }) {
  const accent = tone === 'rose' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400';
  return (
    <div className="flex items-baseline gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
      <h2 className={`text-xs font-bold uppercase tracking-wider ${accent}`}>{label}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function Card({ title, subtitle, Icon, tone, bucket, unitLabel }: Spec) {
  const t = TONE[tone];
  const valueClr = bucket.total === 0 ? 'text-slate-700 dark:text-slate-200' :
                   bucket.total < 0  ? 'text-rose-700 dark:text-rose-400' :
                                       'text-emerald-700 dark:text-emerald-400';
  const partnerCount = bucket.partners.length;
  const unitWord = partnerCount === 1 ? unitLabel.replace(/s$/, '') : unitLabel;

  return (
    <div className={`group relative ix-card p-5 overflow-hidden flex flex-col transition border ${t.border}`}>
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br ${t.gradFrom} ${t.gradTo} opacity-[0.08] blur-2xl pointer-events-none`} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${t.iconBg}`}>
            <Icon size={20} strokeWidth={2.2} className={t.iconText} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight truncate">{title}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={subtitle}>{subtitle}</p>
          </div>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${t.badge}`}>
          {partnerCount} {unitWord}
        </span>
      </div>

      <p className={`text-3xl font-bold tabular-nums mt-4 ${valueClr}`}>{fmt(bucket.total)}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">Net outstanding (residual amount, EGP)</p>

      <div className="mt-3 -mx-2 flex-1 min-h-0">
        {partnerCount === 0 ? (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500 text-sm italic">No outstanding balances.</div>
        ) : (
          <div className="overflow-y-auto max-h-[320px]">
            <table className="w-full text-sm">
              <tbody>
                {bucket.partners.slice(0, 40).map(p => (
                  <tr
                    key={p.partner_id ?? `na:${p.partner_name}`}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <td
                      className="px-2 py-1.5 truncate max-w-[200px] text-slate-700 dark:text-slate-300"
                      title={p.partner_name}
                    >
                      {p.partner_id == null ? (
                        <span className="italic text-slate-500 dark:text-slate-400">{p.partner_name}</span>
                      ) : p.partner_name}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                      {fmt(p.amount)}
                    </td>
                  </tr>
                ))}
                {partnerCount > 40 && (
                  <tr>
                    <td colSpan={2} className="px-2 py-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                      …and {partnerCount - 40} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
