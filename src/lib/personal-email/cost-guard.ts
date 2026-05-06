import { supabaseAdmin } from '@/lib/supabase';

// Sum AI cost across all classification runs that started today (UTC).
export async function getDailyCostUsd(): Promise<number> {
  const sb = supabaseAdmin();
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from('personal_email_classification_runs')
    .select('ai_cost_usd')
    .gte('started_at', startOfDayUtc.toISOString());
  if (error) throw new Error(`cost_guard_query_failed: ${error.message}`);
  return (data ?? []).reduce((s, r: any) => s + Number(r.ai_cost_usd ?? 0), 0);
}

export async function isOverDailyCap(capUsd: number): Promise<boolean> {
  const used = await getDailyCostUsd();
  return used >= capUsd;
}

// Default daily cap, overridable via env. Spec §8.4 default $0.50.
export const DEFAULT_DAILY_CAP_USD = 0.5;

export function readDailyCapFromEnv(): number {
  const raw = process.env.PERSONAL_EMAIL_DAILY_CAP_USD;
  if (!raw) return DEFAULT_DAILY_CAP_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP_USD;
}
