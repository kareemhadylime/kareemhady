import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { LiabilityTable } from '../_components/liabilities/liability-table';
import { LiabilitiesKpiStrip } from '../_components/liabilities/liabilities-kpi-strip';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LiabilitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();

  const sb = supabaseAdmin();
  const [liabilitiesRes, lendersRes, summariesRes, currentRes] = await Promise.all([
    sb
      .from('personal_networth_liabilities')
      .select('*, personal_networth_lenders(name)')
      .eq('app_user_id', user.id)
      .eq('active', true)
      .order('current_balance', { ascending: false }),
    sb
      .from('personal_networth_lenders')
      .select('id, name, kind')
      .eq('app_user_id', user.id)
      .order('name'),
    sb
      .from('v_personal_networth_loan_summary')
      .select('*')
      .eq('app_user_id', user.id),
    sb
      .from('v_personal_networth_current')
      .select('total_liabilities_egp')
      .eq('app_user_id', user.id)
      .maybeSingle(),
  ]);

  if (liabilitiesRes.error) {
    throw new Error(`liabilities fetch failed: ${liabilitiesRes.error.message}`);
  }

  const liabilities = liabilitiesRes.data ?? [];
  const lenders = lendersRes.data ?? [];
  const summaries = summariesRes.data ?? [];
  const totalLiabEgp = Number(currentRes.data?.total_liabilities_egp ?? 0);

  // Compute aggregates in JS (cheap, single-user).
  // For amortizing kinds (loan/bnpl), monthly_payment is set explicitly. For
  // revolving kinds (credit_card/overdraft) monthly_payment is null — fall
  // back to min_payment_pct × current_balance / 100 so the KPI doesn't
  // pretend cards have zero monthly outflow.
  const totalMonthly = liabilities.reduce((s, l) => {
    if (l.monthly_payment != null) return s + Number(l.monthly_payment);
    if (l.kind === 'credit_card' || l.kind === 'overdraft') {
      const pct = Number(l.min_payment_pct ?? 0);
      const bal = Number(l.current_balance ?? 0);
      return s + (pct * bal) / 100;
    }
    return s;
  }, 0);
  const highestApr =
    liabilities.length > 0
      ? Math.max(0, ...liabilities.map(l => Number(l.apr_pct ?? 0)))
      : 0;
  const ytdInterestEgp = summaries.reduce(
    (s, r) => s + Number(r.interest_paid_ytd ?? 0),
    0,
  );

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth"
        title="Liabilities"
        subtitle="Loans · BNPL · Credit cards · Overdraft."
      />
      <LiabilitiesKpiStrip
        totalEgp={totalLiabEgp}
        monthlyOutflow={totalMonthly}
        highestApr={highestApr}
        ytdInterestEgp={ytdInterestEgp}
      />
      <LiabilityTable liabilities={liabilities} lenders={lenders} />
    </NetWorthShell>
  );
}
