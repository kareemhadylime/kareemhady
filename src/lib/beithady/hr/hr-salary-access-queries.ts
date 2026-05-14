// src/lib/beithady/hr/hr-salary-access-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
export type { SalaryTier, SalaryAccessUser } from './hr-salary-access-types';
export { SALARY_TIERS, validateSalaryTier } from './hr-salary-access-types';
import type { SalaryTier, SalaryAccessUser } from './hr-salary-access-types';

// ── Query ─────────────────────────────────────────────────────────────────────

export async function listSalaryAccessUsers(): Promise<SalaryAccessUser[]> {
  const sb = supabaseAdmin();

  const { data: roleRows, error: roleErr } = await sb
    .from('beithady_user_roles')
    .select('user_id, role');
  if (roleErr) throw new Error(roleErr.message);
  if (!roleRows?.length) return [];

  const userIds = [...new Set(roleRows.map((r: { user_id: string }) => r.user_id))];

  const { data: users, error: userErr } = await sb
    .from('app_users')
    .select('id, username, position')
    .in('id', userIds)
    .order('username');
  if (userErr) throw new Error(userErr.message);

  const { data: tiers, error: tierErr } = await sb
    .from('hr_salary_access')
    .select('account_id, tier, granted_at, granted_by');
  if (tierErr) throw new Error(tierErr.message);

  const grantorIds = [
    ...new Set(
      (tiers ?? [])
        .map((t: { granted_by: string | null }) => t.granted_by)
        .filter((id): id is string => !!id)
    ),
  ];
  const grantorMap = new Map<string, string>();
  if (grantorIds.length) {
    const { data: grantors } = await sb
      .from('app_users')
      .select('id, username')
      .in('id', grantorIds);
    for (const g of grantors ?? []) {
      grantorMap.set(
        (g as { id: string; username: string }).id,
        (g as { id: string; username: string }).username
      );
    }
  }

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows as { user_id: string; role: string }[]) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  }

  const tierByUser = new Map<string, { tier: number; granted_at: string; granted_by: string | null }>();
  for (const t of tiers ?? []) {
    tierByUser.set(
      (t as { account_id: string }).account_id,
      t as { tier: number; granted_at: string; granted_by: string | null }
    );
  }

  return (users ?? []).map(u => {
    const row = u as { id: string; username: string; position: string | null };
    const tierRow = tierByUser.get(row.id);
    return {
      user_id:         row.id,
      username:        row.username,
      position:        row.position ?? null,
      beithady_roles:  rolesByUser.get(row.id) ?? [],
      tier:            (tierRow?.tier ?? 0) as SalaryTier,
      granted_at:      tierRow?.granted_at ?? null,
      granted_by_name: tierRow?.granted_by
        ? (grantorMap.get(tierRow.granted_by) ?? null)
        : null,
    };
  });
}
