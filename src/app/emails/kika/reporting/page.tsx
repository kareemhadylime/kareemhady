import Link from 'next/link';
import {
  ChevronRight,
  ClipboardList,
  TrendingUp,
  ShoppingBag,
  Factory,
  AlertTriangle,
  Calendar,
  Calculator,
  ArrowRight,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default function KikaReportingHubPage() {
  return (
    <>
      <TopNav>
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Reporting</span>
      </TopNav>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            KIKA · Reporting
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Reporting</h1>
          <p className="text-sm text-slate-500 mt-1">
            Operational reports and links to deeper analytics
          </p>
        </header>

        {/* Featured: Picker Report */}
        <Link
          href="/emails/kika/reporting/picker"
          className="group ix-card p-5 flex items-center justify-between hover:shadow-md transition relative overflow-hidden"
        >
          <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 opacity-[0.08] blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-indigo-50 text-indigo-600">
              <ClipboardList size={24} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">Picker Report</h3>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                  New · Ops
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Open orders bucketed by SKU count (1-line, 2-line, 3+) · most-common items in backlog · printable A4 picking list
              </p>
            </div>
          </div>
          <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition shrink-0" />
        </Link>

        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold pt-2">
          Existing dashboards
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HubLink
            href="/emails/kika/exec"
            icon={<TrendingUp size={20} strokeWidth={2.2} />}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            title="Executive Summary"
            blurb="KPIs, fulfillment time, delayed orders, manufacturing"
          />
          <HubLink
            href="/emails/kika/sales"
            icon={<ShoppingBag size={20} strokeWidth={2.2} />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            title="Sales Intelligence"
            blurb="Revenue, AOV, top products, daily trend"
          />
          <HubLink
            href="/emails/kika/exec?focus=manufacturing"
            icon={<Factory size={20} strokeWidth={2.2} />}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
            title="To Manufacture"
            blurb="Production plan with stock netting"
          />
          <HubLink
            href="/emails/kika/exec?focus=delayed"
            icon={<AlertTriangle size={20} strokeWidth={2.2} />}
            iconBg="bg-rose-50"
            iconColor="text-rose-600"
            title="Delayed Orders"
            blurb="Oldest unfulfilled, sorted by age"
          />
          <HubLink
            href="/emails/kika/setup"
            icon={<Calendar size={20} strokeWidth={2.2} />}
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            title="Daily Performance Report"
            blurb="09:00 Cairo digest · history of past reports"
          />
          <HubLink
            href="/emails/kika/financials"
            icon={<Calculator size={20} strokeWidth={2.2} />}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            title="Financials"
            blurb="P&L from Odoo"
          />
        </div>
      </main>
    </>
  );
}

function HubLink({
  href,
  icon,
  iconBg,
  iconColor,
  title,
  blurb,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="group ix-card p-4 flex items-start gap-3 hover:shadow-md transition"
    >
      <div className={`w-10 h-10 rounded-lg inline-flex items-center justify-center ${iconBg} ${iconColor} shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{blurb}</p>
      </div>
      <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-600 transition shrink-0 ml-auto self-center" />
    </Link>
  );
}
