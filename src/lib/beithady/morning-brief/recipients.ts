import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { BriefRecipient, BriefRole } from './types';

// Map a brief role to the set of beithady_user_role values that should
// auto-receive it (managers + admins always receive every brief).
const ROLE_BROADCAST: Record<BriefRole, string[]> = {
  guest_relations: ['guest_relations', 'manager', 'admin'],
  ops: ['ops', 'manager', 'admin'],
  finance: ['finance', 'manager', 'admin'],
};

// Resolve the deduplicated recipient list for a brief.
export async function getBriefRecipients(role: BriefRole): Promise<BriefRecipient[]> {
  const sb = supabaseAdmin();
  const out: BriefRecipient[] = [];
  const seen = new Set<string>();

  // 1) Auto-broadcast: users with matching beithady_user_role
  const { data: roleRows } = await sb
    .from('beithady_user_roles')
    .select('user_id')
    .in('role', ROLE_BROADCAST[role]);
  const userIds = Array.from(new Set((roleRows as Array<{ user_id: string }> | null || []).map(r => r.user_id)));
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from('app_users')
      .select('id, username, whatsapp')
      .in('id', userIds);
    for (const u of (users as Array<{ id: string; username: string | null; whatsapp: string | null }> | null) || []) {
      const email = u.username && /\S+@\S+\.\S+/.test(u.username) ? u.username : null;
      const wa = u.whatsapp ? u.whatsapp.replace(/[^\d]/g, '') : null;
      const key = `auto-${u.id}`;
      if (seen.has(key)) continue;
      if (!email && !wa) continue;
      seen.add(key);
      out.push({
        source: 'auto',
        label: u.username || u.id.slice(0, 8),
        email,
        whatsapp: wa,
      });
    }
  }

  // 2) Admin-curated extras
  const { data: extras } = await sb
    .from('beithady_morning_brief_extras')
    .select('id, label, email, whatsapp')
    .eq('role', role)
    .eq('enabled', true);
  for (const e of (extras as Array<{ id: string; label: string; email: string | null; whatsapp: string | null }> | null) || []) {
    const wa = e.whatsapp ? e.whatsapp.replace(/[^\d]/g, '') : null;
    const key = `extra-${e.id}`;
    if (seen.has(key)) continue;
    if (!e.email && !wa) continue;
    seen.add(key);
    out.push({
      source: 'extra',
      label: e.label,
      email: e.email,
      whatsapp: wa,
    });
  }

  return out;
}
