'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { generateAdCopy, logAdCopy, type AdCopyLanguage, SUPPORTED_LANGUAGES } from '@/lib/beithady/ads/ai-copy';
import { publishCtwaCampaign } from '@/lib/beithady/ads/publish';
import { metaPost, loadMetaCredentials } from '@/lib/beithady/ads/meta-client';

async function requireFull() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'ads', 'full'));
  if (!allowed) throw new Error('forbidden');
  return user;
}

// Generate 3 AI copy variants for a draft campaign. Returns to the
// create-campaign wizard with copy pre-populated via query string
// (campaign_draft_id).
export async function generateAdCopyAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  const targetCountry = String(formData.get('target_country') || '').trim() || null;
  const language = String(formData.get('language') || 'en') as AdCopyLanguage;
  const season = String(formData.get('season') || '').trim() || undefined;
  const goalText = String(formData.get('goal_text') || '').trim() || undefined;
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) throw new Error('invalid_language');

  const result = await generateAdCopy({
    buildingCode,
    targetCountry,
    language,
    season,
    goalText,
  });

  // Persist log rows (with no campaign_id yet — they'll link when published)
  const sb = supabaseAdmin();
  const ids: string[] = [];
  for (const v of result.variants) {
    const { data } = await sb
      .from('beithady_ads_ai_copy_log')
      .insert({
        language: result.language,
        variant: v.variant,
        headline: v.headline,
        primary_text: v.primary_text,
        cta: v.cta,
        prompt_version: result.prompt_version,
        model: result.model,
      })
      .select('id')
      .single();
    if (data) ids.push((data as { id: string }).id);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'ad_copy_generated',
    metadata: {
      language,
      building_code: buildingCode,
      target_country: targetCountry,
      variants: result.variants.length,
    },
  });

  revalidatePath('/beithady/ads/create');
  // Round-trip the IDs so the wizard can pre-populate the variant chooser
  redirect(`/beithady/ads/create?copy=${ids.join(',')}&building=${buildingCode || ''}&country=${targetCountry || ''}&language=${language}`);
}

// Publish a campaign — calls publishCtwaCampaign which falls back to
// "draft" mode when meta_marketing credentials are missing.
export async function publishCampaignAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignName = String(formData.get('campaign_name') || '').trim();
  const buildingCodes = String(formData.get('building_codes') || '').split(',').map(s => s.trim()).filter(Boolean);
  const targetCountries = String(formData.get('target_countries') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const dailyBudgetUsd = Number.parseFloat(String(formData.get('daily_budget_usd') || '5'));
  const durationDays = Number.parseInt(String(formData.get('duration_days') || '0'), 10) || 0;
  const headline = String(formData.get('headline') || '').trim();
  const primaryText = String(formData.get('primary_text') || '').trim();
  const language = String(formData.get('language') || 'en');
  const galleryAssetIds = String(formData.get('gallery_asset_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const ageMin = Number.parseInt(String(formData.get('age_min') || '25'), 10);
  const ageMax = Number.parseInt(String(formData.get('age_max') || '65'), 10);

  if (!campaignName || !buildingCodes.length || !targetCountries.length || !headline || !primaryText) {
    redirect('/beithady/ads/create?error=missing_required_fields');
  }
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd < 1) {
    redirect('/beithady/ads/create?error=invalid_budget');
  }

  const result = await publishCtwaCampaign({
    campaignName,
    buildingCodes,
    targetCountries,
    ageMin,
    ageMax,
    dailyBudgetUsd,
    durationDays,
    galleryAssetIds,
    headline,
    primaryText,
    language,
  });

  if (!result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'ads',
      action: 'campaign_publish_failed',
      metadata: { step: result.step, error: result.error, mode: result.mode },
    });
    redirect(`/beithady/ads/create?error=${encodeURIComponent(`${result.step}: ${result.error}`)}`);
  }

  revalidatePath('/beithady/ads');
  revalidatePath('/beithady/ads/campaigns');
  redirect(`/beithady/ads/campaigns/${result.campaign_id}?published=${result.mode}`);
}

// Toggle campaign status — pauses or resumes via Meta API + DB
export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const campaignId = Number.parseInt(String(formData.get('campaign_id') || ''), 10);
  const status = String(formData.get('status') || '').toUpperCase(); // 'PAUSED' | 'ACTIVE'
  if (!Number.isFinite(campaignId) || !['PAUSED', 'ACTIVE'].includes(status)) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('ads_campaigns')
    .select('id, external_id, platform, status')
    .eq('id', campaignId)
    .maybeSingle();
  if (!row) throw new Error('campaign_not_found');
  const c = row as { id: number; external_id: string; platform: string; status: string | null };

  // If draft (no external_id starts with 'draft_'), only update local
  if (c.external_id.startsWith('draft_')) {
    await sb.from('ads_campaigns').update({ status }).eq('id', campaignId);
  } else if (c.platform === 'meta') {
    const creds = await loadMetaCredentials();
    if (creds.ok) {
      await metaPost(`${c.external_id}`, { status }, creds.creds.token);
    }
    await sb.from('ads_campaigns').update({ status }).eq('id', campaignId);
  } else {
    await sb.from('ads_campaigns').update({ status }).eq('id', campaignId);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'campaign_status_changed',
    target_type: 'campaign',
    target_id: String(campaignId),
    before: { status: c.status },
    after: { status },
  });

  revalidatePath('/beithady/ads');
  revalidatePath(`/beithady/ads/campaigns/${campaignId}`);
}
