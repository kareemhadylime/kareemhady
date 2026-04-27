import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from './audit';

// Beithady settings KV — read/write helpers around beithady_settings.
// All values are JSONB so callers cast to whatever shape the key holds.

export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (!data) return fallback;
  const v = (data as { value: T | null }).value;
  return (v ?? fallback) as T;
}

export async function setSetting<T>(
  key: string,
  value: T,
  meta: { actorUserId?: string; description?: string } = {}
): Promise<void> {
  const sb = supabaseAdmin();
  // Pull the current value so we can audit before+after.
  const before = await getSetting<unknown>(key, null);
  await sb.from('beithady_settings').upsert(
    {
      key,
      value: value as unknown as object,
      description: meta.description ?? null,
      updated_at: new Date().toISOString(),
      updated_by: meta.actorUserId || null,
    },
    { onConflict: 'key' }
  );
  await recordAudit({
    actor_user_id: meta.actorUserId,
    module: 'settings',
    action: 'setting_updated',
    target_type: 'setting',
    target_id: key,
    before,
    after: value,
  });
}

// Specific typed getters for the seeded keys — call sites should prefer
// these over getSetting<T>() so type drift is caught at compile time.

export async function getAiConfidenceThreshold(): Promise<number> {
  const v = await getSetting<number | string>('ai_confidence_threshold', 0.85);
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0.85;
  return n;
}

export async function isAiAutoReplyEnabled(): Promise<boolean> {
  return getSetting<boolean>('ai_auto_reply_enabled', true);
}

export async function isVipDigestEnabled(): Promise<boolean> {
  return getSetting<boolean>('vip_digest_enabled', true);
}
