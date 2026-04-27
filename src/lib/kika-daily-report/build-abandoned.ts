import 'server-only';
import { supabaseAdmin } from '../supabase';
import { addDays } from './cairo-dates';
import type { AbandonedSection } from './types';
import type { AbandonedRow } from './corpus';

// Abandoned checkout section. Yesterday-only window (vs. wider checkout
// reports because the daily digest needs to fit on one A4). Computes:
//   - count of abandoned (completed_at IS NULL within yesterday)
//   - recoverable revenue (sum total_price)
//   - recovery rate (completed / all in yesterday)
//   - email-deliverable subset
//   - top 5 by cart value with resume URL
//
// We also count yesterday's COMPLETED checkouts (created yesterday,
// completed at any time) so the recovery rate is meaningful.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function buildAbandonedSection(args: {
  abandonedYesterday: AbandonedRow[];
  yesterdayYmd: string;
}): Promise<AbandonedSection> {
  const sb = supabaseAdmin();

  // The yesterday-only abandoned snapshot was loaded via the corpus.
  // For recovery rate we ALSO need yesterday's completed checkouts —
  // a separate small query (the corpus loader skips `completed_at IS NOT NULL`
  // beyond yesterday's window).
  const { data: completedRows } = await sb
    .from('shopify_abandoned_checkouts')
    .select('id, completed_at, created_at')
    .gte('created_at', `${args.yesterdayYmd}T00:00:00Z`)
    .lt('created_at', `${addDays(args.yesterdayYmd, 1)}T00:00:00Z`)
    .not('completed_at', 'is', null);

  const completed = (completedRows as Array<{ id: number; completed_at: string | null }> | null) || [];

  const abandoned = args.abandonedYesterday.filter(r => !r.completed_at);
  const total = abandoned.length + completed.length;
  const recoverable = abandoned.reduce(
    (s, r) => s + (Number(r.total_price) || 0),
    0
  );
  const avgCart =
    abandoned.length > 0 ? recoverable / abandoned.length : null;
  const recoveryRate =
    total > 0 ? (completed.length / total) * 100 : null;
  const withEmail = abandoned.filter(r => !!r.email).length;
  const withEmailPct =
    abandoned.length > 0 ? (withEmail / abandoned.length) * 100 : null;

  const now = Date.now();
  const top5 = abandoned
    .slice()
    .sort((a, b) => (Number(b.total_price) || 0) - (Number(a.total_price) || 0))
    .slice(0, 5)
    .map(r => {
      const ageHours = r.created_at
        ? Math.max(0, (now - new Date(r.created_at).getTime()) / 3_600_000)
        : null;
      return {
        id: r.id,
        customer_name: r.customer_name,
        email: r.email,
        total_egp: round2(Number(r.total_price) || 0),
        line_items: r.line_items_count ?? 0,
        age_hours: ageHours !== null ? Number(ageHours.toFixed(1)) : null,
        resume_url: r.abandoned_checkout_url,
      };
    });

  return {
    count: abandoned.length,
    recoverable_egp: round2(recoverable),
    avg_cart_egp: avgCart !== null ? round2(avgCart) : null,
    recovery_rate_pct:
      recoveryRate !== null ? Number(recoveryRate.toFixed(1)) : null,
    with_email_count: withEmail,
    with_email_pct:
      withEmailPct !== null ? Number(withEmailPct.toFixed(1)) : null,
    top_5: top5,
  };
}
