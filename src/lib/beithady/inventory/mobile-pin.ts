import 'server-only';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import type { WarehouseRow } from './warehouses-shared';

// Mobile cleaner app session = building-PIN gate (Q6) + named session (C2).
// Stored as a signed-ish opaque cookie. No real auth; the PIN is the proof.
// Cookie format: beithady_inv_pin_session = JSON {warehouseCode, cleanerName, expiresAt}

const COOKIE_NAME = 'beithady_inv_pin_session';
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export type MobileSession = {
  warehouseCode: string;
  warehouseId: string;
  warehouseName: string;
  buildingCode: string | null;
  cleanerName: string;
  expiresAt: number;
};

export async function readMobileSession(): Promise<MobileSession | null> {
  const c = await cookies();
  const raw = c.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MobileSession;
    if (parsed.expiresAt < Date.now()) return null;
    if (!parsed.warehouseCode || !parsed.cleanerName || !parsed.warehouseId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeMobileSession(s: Omit<MobileSession, 'expiresAt'>): Promise<MobileSession> {
  const session: MobileSession = { ...s, expiresAt: Date.now() + SESSION_TTL_MS };
  const c = await cookies();
  c.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/beithady/inventory/m',
  });
  return session;
}

export async function clearMobileSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

// Validate a (buildingWarehouseCode, pin) pair against beithady_settings.
// Returns the warehouse row if valid, null otherwise. Rate-limit and
// audit logging are handled by the action layer via checkPinRateLimit
// and recordPinAttempt below.
export async function validateBuildingPin(
  warehouseCode: string,
  pin: string,
): Promise<WarehouseRow | null> {
  if (!warehouseCode || !pin) return null;
  if (!/^\d{6}$/.test(pin)) return null;

  const sb = supabaseAdmin();
  const { data: settingRow } = await sb
    .from('beithady_settings')
    .select('value')
    .eq('key', `inventory_pin_${warehouseCode}`)
    .maybeSingle();

  const expected = (settingRow as { value: { pin?: string } } | null)?.value?.pin;
  if (!expected || expected !== pin) return null;

  const { data: wh } = await sb
    .from('beithady_inventory_warehouses')
    .select('*')
    .eq('code', warehouseCode)
    .eq('active', true)
    .maybeSingle();

  return wh as WarehouseRow | null;
}

// Audit fix C4: per-IP rate limit. Five failed attempts within
// PIN_LOCKOUT_WINDOW_MS triggers a lockout for the same window. Counted
// from the most recent failure, so a determined attacker doesn't roll
// off the window by spreading attempts.
export const PIN_FAIL_THRESHOLD = 5;
export const PIN_LOCKOUT_WINDOW_MS = 5 * 60 * 1000;

export type PinRateLimitState =
  | { locked: false }
  | { locked: true; retryAfterSec: number };

export async function checkPinRateLimit(ip: string | null): Promise<PinRateLimitState> {
  if (!ip) return { locked: false }; // can't enforce without an IP
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - PIN_LOCKOUT_WINDOW_MS).toISOString();
  const { data, count } = await sb
    .from('beithady_inventory_mobile_pin_attempts')
    .select('attempted_at', { count: 'exact' })
    .eq('ip', ip)
    .eq('success', false)
    .gte('attempted_at', since)
    .order('attempted_at', { ascending: false })
    .limit(1);
  if ((count ?? 0) < PIN_FAIL_THRESHOLD) return { locked: false };
  const lastAttemptIso = (data as Array<{ attempted_at: string }> | null)?.[0]?.attempted_at;
  const lastMs = lastAttemptIso ? Date.parse(lastAttemptIso) : Date.now();
  const retryAfterSec = Math.max(1, Math.ceil((lastMs + PIN_LOCKOUT_WINDOW_MS - Date.now()) / 1000));
  return { locked: true, retryAfterSec };
}

export async function recordPinAttempt(input: {
  warehouseCode: string;
  ip: string | null;
  userAgent: string | null;
  cleanerName: string | null;
  success: boolean;
}): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('beithady_inventory_mobile_pin_attempts').insert({
    warehouse_code: input.warehouseCode,
    ip: input.ip,
    user_agent: input.userAgent,
    cleaner_name: input.cleanerName,
    success: input.success,
  });
}

// Returns the list of buildings with active PINs (one main warehouse per
// building). Used by the PIN-entry UI to show building chips.
export async function listBuildingChoices(): Promise<Array<{
  warehouseCode: string;
  warehouseId: string;
  warehouseName: string;
  buildingCode: string | null;
}>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_warehouses')
    .select('id, code, name_en, name_ar, building_code')
    .is('parent_id', null)
    .eq('active', true)
    .not('building_code', 'is', null)
    .order('building_code', { ascending: true });
  return ((data as Array<{ id: string; code: string; name_en: string; name_ar: string; building_code: string | null }> | null) || [])
    .map(w => ({
      warehouseCode: w.code,
      warehouseId: w.id,
      warehouseName: w.name_ar || w.name_en,
      buildingCode: w.building_code,
    }));
}
