import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Single-call audit-log writer used across every Beithady module.
// Failure to log must NEVER block the user's action — we swallow errors
// and console.warn so an audit DB hiccup doesn't break feature flows.

export type AuditModule =
  | 'foundation'
  | 'crm'
  | 'communication'
  | 'ads'
  | 'gallery'
  | 'settings';

export type AuditEntry = {
  actor_user_id?: string | null;
  module: AuditModule;
  action: string;
  target_type?: string;
  target_id?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from('beithady_audit_log').insert({
      actor_user_id: entry.actor_user_id || null,
      module: entry.module,
      action: entry.action,
      target_type: entry.target_type || null,
      target_id: entry.target_id || null,
      before: entry.before === undefined ? null : entry.before,
      after: entry.after === undefined ? null : entry.after,
      metadata: entry.metadata || null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[beithady_audit] insert failed:', e);
  }
}

export type AuditQueryOpts = {
  module?: AuditModule;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  since?: string;
  until?: string;
  limit?: number;
};

export type AuditRow = {
  id: string;
  actor_user_id: string | null;
  module: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function queryAudit(opts: AuditQueryOpts = {}): Promise<AuditRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_audit_log')
    .select('id, actor_user_id, module, action, target_type, target_id, before, after, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.module) q = q.eq('module', opts.module);
  if (opts.actorUserId) q = q.eq('actor_user_id', opts.actorUserId);
  if (opts.targetType) q = q.eq('target_type', opts.targetType);
  if (opts.targetId) q = q.eq('target_id', opts.targetId);
  if (opts.since) q = q.gte('created_at', opts.since);
  if (opts.until) q = q.lte('created_at', opts.until);
  const { data } = await q;
  return (data as AuditRow[] | null) || [];
}
