// Types and constants shared between server and client — no server-only deps.

export type SalaryTier = 0 | 1 | 2 | 3 | 4;

export const SALARY_TIERS: {
  tier: SalaryTier;
  label: string;
  sublabel: string;
  accent: string;
}[] = [
  { tier: 0, label: 'No Access',   sublabel: 'default',      accent: 'slate'   },
  { tier: 1, label: '≤ 10,000',    sublabel: 'EGP / month',  accent: 'amber'   },
  { tier: 2, label: '≤ 20,000',    sublabel: 'EGP / month',  accent: 'orange'  },
  { tier: 3, label: '≤ 50,000',    sublabel: 'EGP / month',  accent: 'blue'    },
  { tier: 4, label: 'Unlimited',   sublabel: 'full access',  accent: 'emerald' },
];

export function validateSalaryTier(v: unknown): v is SalaryTier {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4;
}

export type SalaryAccessUser = {
  user_id: string;
  username: string;
  position: string | null;
  beithady_roles: string[];
  tier: SalaryTier;
  granted_at: string | null;
  granted_by_name: string | null;
};
