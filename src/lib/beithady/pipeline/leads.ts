import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type LeadStage = 'new' | 'contacted' | 'quoted' | 'booked' | 'lost';
export const LEAD_STAGES: LeadStage[] = ['new', 'contacted', 'quoted', 'booked', 'lost'];

export type LeadSource =
  | 'website'
  | 'whatsapp'
  | 'instagram'
  | 'manual'
  | 'ads'
  | 'referral'
  | 'agent'
  | 'direct_inquiry';

export type LeadRow = {
  id: string;
  source: LeadSource;
  source_external_id: string | null;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  message: string | null;
  listing_interest: string | null;
  building_interest: string | null;
  travel_dates: Record<string, unknown> | null;
  budget_usd: number | null;
  guest_id: string | null;
  ad_lead_id: number | null;
  reservation_id: string | null;
  stage: LeadStage;
  rating: number | null;
  lost_reason: string | null;
  notes: string | null;
  assignee_user_id: string | null;
  contacted_at: string | null;
  quoted_at: string | null;
  booked_at: string | null;
  lost_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadIntakeInput = {
  source: LeadSource;
  source_external_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;       // raw, will normalize to E.164
  message?: string | null;
  listing_interest?: string | null;
  building_interest?: string | null;
  travel_dates?: { check_in?: string; check_out?: string; nights?: number; guests?: number } | null;
  budget_usd?: number | null;
  raw_payload?: Record<string, unknown>;
};

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length >= 8 ? '+' + digits : null;
}

// Match an inbound lead to an existing beithady_guest by email or phone.
async function findGuestId(email: string | null, phoneE164: string | null): Promise<string | null> {
  if (!email && !phoneE164) return null;
  const sb = supabaseAdmin();
  if (email) {
    const { data } = await sb
      .from('beithady_guests')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  if (phoneE164) {
    const { data } = await sb
      .from('beithady_guests')
      .select('id')
      .eq('phone_e164', phoneE164)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  return null;
}

export async function createLead(input: LeadIntakeInput): Promise<{ ok: true; lead_id: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const phoneE164 = normalizePhone(input.phone);
  const email = input.email ? input.email.trim().toLowerCase() : null;

  if (!phoneE164 && !email) {
    return { ok: false, error: 'missing_email_or_phone' };
  }

  const guestId = await findGuestId(email, phoneE164);

  const { data, error } = await sb
    .from('beithady_leads')
    .insert({
      source: input.source,
      source_external_id: input.source_external_id ?? null,
      full_name: input.full_name?.trim() || null,
      email,
      phone_e164: phoneE164,
      message: input.message?.slice(0, 4000) || null,
      listing_interest: input.listing_interest || null,
      building_interest: input.building_interest || null,
      travel_dates: input.travel_dates || null,
      budget_usd: input.budget_usd && Number.isFinite(input.budget_usd) ? input.budget_usd : null,
      guest_id: guestId,
      raw_payload: input.raw_payload || null,
      stage: 'new',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lead_id: (data as { id: string }).id };
}

export async function listLeadsByStage(): Promise<Record<LeadStage, LeadRow[]>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  const grouped: Record<LeadStage, LeadRow[]> = {
    new: [], contacted: [], quoted: [], booked: [], lost: [],
  };
  for (const row of (data as LeadRow[] | null) || []) {
    grouped[row.stage]?.push(row);
  }
  return grouped;
}

export async function getPipelineStats(): Promise<{ counts: Record<LeadStage, number>; conversion_pct: number; this_week: number }> {
  const sb = supabaseAdmin();
  const counts: Record<LeadStage, number> = { new: 0, contacted: 0, quoted: 0, booked: 0, lost: 0 };
  const { data } = await sb.from('beithady_pipeline_counts').select('*');
  for (const r of (data as Array<{ stage: LeadStage; cnt: number }> | null) || []) {
    counts[r.stage] = r.cnt;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const conversion = total > 0 ? Math.round((counts.booked / total) * 1000) / 10 : 0;
  const sevenDayCutoff = new Date(Date.now() - 7 * 86400e3).toISOString();
  const { count } = await sb.from('beithady_leads').select('id', { count: 'exact', head: true }).gte('created_at', sevenDayCutoff);
  return { counts, conversion_pct: conversion, this_week: count ?? 0 };
}

export async function updateLeadStage(leadId: string, stage: LeadStage, lostReason?: string): Promise<void> {
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = { stage };
  if (stage === 'lost' && lostReason) patch.lost_reason = lostReason;
  await sb.from('beithady_leads').update(patch).eq('id', leadId);
}
