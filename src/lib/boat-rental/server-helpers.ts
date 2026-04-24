import 'server-only';
import { getCurrentUser, type SessionUser } from '../auth';
import { supabaseAdmin } from '../supabase';
import { hasBoatRole, type BoatRole } from './auth';

// Helpers used by server actions. Layout/page-level gates use
// requireBoatRole (which redirects/404s); server actions throw so the
// form submission fails visibly.

export async function requireBoatAdmin(): Promise<SessionUser> {
  const me = await getCurrentUser();
  if (!me) throw new Error('unauthorized');
  if (!(await hasBoatRole(me, 'admin'))) throw new Error('forbidden');
  return me;
}

export async function requireBoatRoleOrThrow(role: BoatRole): Promise<SessionUser> {
  const me = await getCurrentUser();
  if (!me) throw new Error('unauthorized');
  if (!(await hasBoatRole(me, role))) throw new Error('forbidden');
  return me;
}

// Single audit log write. Never throws — audit failures shouldn't block
// the state transition that spawned them.
export async function logAudit(args: {
  reservationId?: string | null;
  actorUserId?: string | null;
  actorRole?: 'admin' | 'broker' | 'owner' | 'system';
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from('boat_rental_audit_log').insert({
      reservation_id: args.reservationId ?? null,
      actor_user_id: args.actorUserId ?? null,
      actor_role: args.actorRole ?? null,
      action: args.action,
      from_status: args.fromStatus ?? null,
      to_status: args.toStatus ?? null,
      payload: args.payload ?? null,
    });
  } catch {
    // silent — audit is best-effort
  }
}

// Turns a form value into a trimmed string, or empty string.
export function s(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function sOrNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length > 0 ? t : null;
}

export function nOrNull(v: FormDataEntryValue | null): number | null {
  const t = s(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Short reservation reference for WhatsApp templates: 8 hex chars.
export function shortRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}

// Normalizes a phone entry to digits-only (Green-API chatId format).
export function normPhone(raw: string): string {
  return (raw || '').replace(/[^0-9]/g, '');
}
