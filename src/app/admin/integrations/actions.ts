'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import {
  CREDENTIAL_SPECS,
  invalidateCredentials,
  type ProviderId,
} from '@/lib/credentials';

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.is_admin) throw new Error('forbidden');
  return me;
}

function isProviderId(p: string): p is ProviderId {
  return Object.prototype.hasOwnProperty.call(CREDENTIAL_SPECS, p);
}

// Save credential config for a provider. Empty fields preserve the existing
// value (so admins don't have to re-enter secrets just to update one field).
export async function saveCredentialsAction(formData: FormData) {
  const me = await requireAdmin();
  const provider = String(formData.get('provider') || '');
  if (!isProviderId(provider)) return;
  const spec = CREDENTIAL_SPECS[provider];

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('integration_credentials')
    .select('config')
    .eq('provider', provider)
    .maybeSingle();
  const current = ((existing as { config: Record<string, string> | null } | null)
    ?.config) || {};

  // Merge: only overwrite fields that were submitted non-empty.
  const next = { ...current };
  for (const f of spec.fields) {
    const v = String(formData.get(`f:${f.key}`) || '');
    if (v.trim().length > 0) next[f.key] = v.trim();
    // If admin sends an empty field AND ticks the 'clear' box, wipe it.
    if (!v.trim() && formData.get(`clear:${f.key}`)) {
      delete next[f.key];
    }
  }
  const enabled = formData.get('enabled') === 'on';

  await sb.from('integration_credentials').upsert(
    {
      provider,
      config: next,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: me.id,
    },
    { onConflict: 'provider' }
  );
  invalidateCredentials(provider);
  revalidatePath('/admin/integrations');
}

// Record a test-connection result. The actual API call runs on the
// existing /api/{provider}/ping endpoints (bearer-auth'd); this action
// only updates the status row after the admin clicks "Test".
export async function recordTestResultAction(formData: FormData) {
  await requireAdmin();
  const provider = String(formData.get('provider') || '');
  const status = String(formData.get('status') || '');
  const error = String(formData.get('error') || '');
  if (!isProviderId(provider)) return;
  const sb = supabaseAdmin();
  await sb
    .from('integration_credentials')
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_status: status || null,
      last_test_error: error || null,
    })
    .eq('provider', provider);
  revalidatePath('/admin/integrations');
}

// One-shot: copy every env-var-sourced credential into the DB. Run once
// after Phase 12 deploys so the DB has the same values the env vars had.
// Skips fields that already have a DB value (so re-running is safe).
export async function seedFromEnvAction(): Promise<void> {
  const me = await requireAdmin();
  const sb = supabaseAdmin();
  for (const [provider, spec] of Object.entries(CREDENTIAL_SPECS) as Array<
    [ProviderId, typeof CREDENTIAL_SPECS[ProviderId]]
  >) {
    const { data: existing } = await sb
      .from('integration_credentials')
      .select('config')
      .eq('provider', provider)
      .maybeSingle();
    const cfg = ((existing as { config: Record<string, string> | null } | null)
      ?.config) || {};
    let seededCount = 0;
    for (const f of spec.fields) {
      if (cfg[f.key]) continue; // already set in DB — don't overwrite
      const envVal = (process.env[f.envVar] || '').trim();
      if (envVal) {
        cfg[f.key] = envVal;
        seededCount++;
      }
    }
    if (seededCount > 0) {
      await sb.from('integration_credentials').upsert(
        {
          provider,
          config: cfg,
          enabled: true,
          updated_at: new Date().toISOString(),
          updated_by: me.id,
        },
        { onConflict: 'provider' }
      );
    }
  }
  invalidateCredentials();
  revalidatePath('/admin/integrations');
}
