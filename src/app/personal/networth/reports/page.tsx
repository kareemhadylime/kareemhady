import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { MonthlyReportClient } from '../_components/reports/monthly-report';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getMonthlyReport } from '@/lib/personal/networth/queries';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();
  const sp = await searchParams;

  // Default the month-picker to *Cairo* today, not UTC today — same reason
  // the queries file does this: UTC midnight rollover would otherwise show
  // the previous month for the first 2–3 hours of Cairo wall-clock time.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const cairoYear = Number(parts.find(p => p.type === 'year')?.value ?? new Date().getFullYear());
  const cairoMonth = Number(parts.find(p => p.type === 'month')?.value ?? new Date().getMonth() + 1);

  const yearRaw = Number(sp.year ?? cairoYear);
  const monthRaw = Number(sp.month ?? cairoMonth);
  // Clamp to sane bounds — if a querystring tampers with year/month we fall
  // back to Cairo today rather than letting the SQL date math blow up.
  const year =
    Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : cairoYear;
  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : cairoMonth;

  const report = await getMonthlyReport(user.id, year, month);

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth"
        title="Reports"
        subtitle="Monthly payment breakdown with month-over-month delta and 12-month trend."
      />
      <MonthlyReportClient
        initialReport={report}
        initialYear={year}
        initialMonth={month}
        cairoYear={cairoYear}
        cairoMonth={cairoMonth}
      />
    </NetWorthShell>
  );
}
