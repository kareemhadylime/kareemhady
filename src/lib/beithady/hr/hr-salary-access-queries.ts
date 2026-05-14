// src/lib/beithady/hr/hr-salary-access-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// ── Tier constants ────────────────────────────────────────────────────────────

export type SalaryTier = 0 | 1 | 2 | 3 | 4;

export const SALARY_TIERS: {
  tier: SalaryTier;
  label: string;
  sublabel: string;
  accent: string;
}[] = [
  { tier: 0, label: 'No Access',   sublabel: 'default',      accent: 'slate'  },
  { tier: 1, label: '≤ 10,000',    sublabel: 'EGP / month',  accent: 'amber'  },
  { tier: 2, label: '≤ 20,000',    sublabel: 'EGP / month',  accent: 'orange' },
  { tier: 3, label: '≤ 50,000',    sublabel: 'EGP / month',  accent: 'blue'   },
  { tier: 4, label: 'Unlimited',   sublabel: 'full access',  accent: 'emerald'},
];

// Pure validation — safe to call on unvalidated input.
export function validateSalaryTier(v: unknown): v is SalaryTier {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SalaryAccessUser = {
  user_id: string;
  username: string;
  position: string | null;
  beithady_roles: string[];
  tier: SalaryTier;
  granted_at: string | null;
  granted_by_name: string | null;
};

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
