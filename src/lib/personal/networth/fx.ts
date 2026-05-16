import { supabaseAdmin } from '@/lib/supabase';

type ConversionResult =
  | { egp: number; rate: number; rateAsOf: string }
  | { error: 'missing_rate'; currency: string; asOfDate: string };

export async function convertToEgp(
  amount: number,
  currency: string,
  asOfDate: string,
): Promise<ConversionResult> {
  if (currency === 'EGP') return { egp: amount, rate: 1, rateAsOf: asOfDate };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_fx_rates')
    .select('rate_to_egp, as_of_date')
    .eq('currency_code', currency)
    .lte('as_of_date', asOfDate)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { error: 'missing_rate', currency, asOfDate };
  return {
    egp: Math.round(amount * Number(data.rate_to_egp) * 100) / 100,
    rate: Number(data.rate_to_egp),
    rateAsOf: data.as_of_date,
  };
}

export async function latestRate(currency: string): Promise<number | null> {
  if (currency === 'EGP') return 1;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_networth_fx_rates')
    .select('rate_to_egp')
    .eq('currency_code', currency)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.rate_to_egp) : null;
}

export async function ratesAsOf(asOfDate: string): Promise<Record<string, number>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_networth_currencies')
    .select('code');
  if (!data) return { EGP: 1 };
  const out: Record<string, number> = { EGP: 1 };
  for (const row of data) {
    if (row.code === 'EGP') continue;
    const r = await sb
      .from('personal_networth_fx_rates')
      .select('rate_to_egp')
      .eq('currency_code', row.code)
      .lte('as_of_date', asOfDate)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (r.data) out[row.code] = Number(r.data.rate_to_egp);
  }
  return out;
}
