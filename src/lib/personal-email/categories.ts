import type { CategorySlug } from './types';

export type CategoryDef = {
  slug: CategorySlug;
  displayName: string;
  tier: 1 | 2 | 3 | 4;
  sortOrder: number;
  gmailLabelName: string;
  accentColor: string;
  iconName: string;
};

// Order matches mig 0081 seed; canonical reference for code that doesn't
// want to hit the DB (e.g. UI defaults before user customization).
export const CATEGORIES: CategoryDef[] = [
  { slug: 'action_required', displayName: 'Action Required',     tier: 1, sortOrder: 10, gmailLabelName: 'Lime/ActionRequired', accentColor: 'rose',    iconName: 'Reply' },
  { slug: 'security',        displayName: 'Security',             tier: 1, sortOrder: 20, gmailLabelName: 'Lime/Security',      accentColor: 'amber',   iconName: 'ShieldCheck' },
  { slug: 'travel',          displayName: 'Travel',               tier: 1, sortOrder: 30, gmailLabelName: 'Lime/Travel',        accentColor: 'sky',     iconName: 'Plane' },
  { slug: 'bills_receipts',  displayName: 'Bills & Receipts',     tier: 2, sortOrder: 10, gmailLabelName: 'Lime/Bills',         accentColor: 'emerald', iconName: 'Receipt' },
  { slug: 'personal',        displayName: 'Personal',             tier: 2, sortOrder: 20, gmailLabelName: 'Lime/Personal',      accentColor: 'pink',    iconName: 'Heart' },
  { slug: 'newsletters',     displayName: 'Newsletters',          tier: 3, sortOrder: 10, gmailLabelName: 'Lime/Newsletters',   accentColor: 'indigo',  iconName: 'BookOpen' },
  { slug: 'notifications',   displayName: 'Notifications / FYI',  tier: 3, sortOrder: 20, gmailLabelName: 'Lime/Notifications', accentColor: 'slate',   iconName: 'Bell' },
  { slug: 'promotions',      displayName: 'Promotions / Ads',     tier: 4, sortOrder: 10, gmailLabelName: 'Lime/Promotions',    accentColor: 'violet',  iconName: 'Tag' },
  { slug: 'spam',            displayName: 'Spam / Junk',          tier: 4, sortOrder: 20, gmailLabelName: 'Lime/Spam',          accentColor: 'zinc',    iconName: 'XCircle' },
];

// Categories that ALWAYS go through the AI classifier even when a rule
// matched — semantic judgment matters more than the rule's heuristic.
// (Spec §11 step 3.)
export const ALWAYS_AI_CATEGORIES: ReadonlySet<CategorySlug> = new Set<CategorySlug>([
  'action_required',
  'personal',
]);

export const TIER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Act now',
  2: 'File / track',
  3: 'Skim / skip',
  4: 'Delete-bait',
};

export function getCategory(slug: string): CategoryDef | undefined {
  return CATEGORIES.find(c => c.slug === slug);
}

export function getCategoriesByTier(tier: 1 | 2 | 3 | 4): CategoryDef[] {
  return CATEGORIES.filter(c => c.tier === tier).sort((a, b) => a.sortOrder - b.sortOrder);
}
