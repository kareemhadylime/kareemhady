import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// RFC-4180-ish CSV escaping: wrap in quotes if the cell contains a
// quote, newline, or comma; double-up internal quotes.
function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  const needsQuote = /["\n,]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('unauthorized', { status: 401 });
  if (!user.is_admin) return new Response('forbidden', { status: 403 });

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const category = url.searchParams.get('category');
  const liabilityId = url.searchParams.get('liabilityId');

  const sb = supabaseAdmin();
  let q = sb
    .from('personal_networth_payments')
    .select(
      'occurred_on, amount, currency, category, notes, personal_networth_liabilities(name)',
    )
    .eq('app_user_id', user.id)
    .order('occurred_on', { ascending: false });

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte('occurred_on', from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte('occurred_on', to);
  if (category) q = q.eq('category', category);
  if (liabilityId) q = q.eq('liability_id', liabilityId);

  const { data, error } = await q.limit(5000);
  if (error) return new Response(`error: ${error.message}`, { status: 500 });

  type Row = {
    occurred_on: string;
    amount: number | string;
    currency: string;
    category: string;
    notes: string | null;
    personal_networth_liabilities?: { name?: string } | null;
  };
  const header = 'date,amount,currency,category,liability,notes\n';
  const body = ((data as Row[] | null) ?? [])
    .map(r =>
      [
        r.occurred_on,
        r.amount,
        r.currency,
        r.category,
        r.personal_networth_liabilities?.name ?? '',
        r.notes ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
    .join('\n');
  const filename = `payments-${from ?? 'all'}-to-${to ?? 'all'}.csv`;
  return new Response(header + body + (body ? '\n' : ''), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
