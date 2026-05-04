import type { CategorySlug } from './types';

export type CategoryDef = {
  slug: CategorySlug;
  displayName: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  sortOrder: number;
  gmailLabelName: string;
  accentColor: string;
  iconName: string;
};

// Order matches mig 0081 seed; canonical reference for code that doesn't
// want to hit the DB (e.g. UI defaults before user customization).
export const CATEGORIES: CategoryDef[] = [
  { slug: 'action_required', displayName: 'Action Required',     description: 'Real humans waiting on YOUR reply or chasing a decision.',           tier: 1, sortOrder: 10, gmailLabelName: 'Lime/ActionRequired', accentColor: 'rose',    iconName: 'Reply' },
  { slug: 'security',        displayName: 'Security',             description: '2FA codes, login alerts, password resets, account changes.',          tier: 1, sortOrder: 20, gmailLabelName: 'Lime/Security',      accentColor: 'amber',   iconName: 'ShieldCheck' },
  { slug: 'travel',          displayName: 'Travel',               description: 'Flight, hotel, ride-share confirmations and itinerary changes.',      tier: 1, sortOrder: 30, gmailLabelName: 'Lime/Travel',        accentColor: 'sky',     iconName: 'Plane' },
  { slug: 'banking',         displayName: 'Banking',              description: 'Bank statements, card activity, transfers, balance alerts.',           tier: 2, sortOrder: 5,  gmailLabelName: 'Lime/Banking',       accentColor: 'green',   iconName: 'Landmark' },
  { slug: 'bills_receipts',  displayName: 'Bills & Receipts',     description: 'Invoices, payment confirmations, statements, refunds.',               tier: 2, sortOrder: 10, gmailLabelName: 'Lime/Bills',         accentColor: 'emerald', iconName: 'Receipt' },
  { slug: 'personal',            displayName: 'Personal',         description: 'One-to-one from real humans — friends, family, contacts.',             tier: 2, sortOrder: 20, gmailLabelName: 'Lime/Personal',      accentColor: 'pink',    iconName: 'Heart' },
  { slug: 'subsidiary_beithady', displayName: 'Beithady',         description: 'Airbnb · Booking · Expedia · Guesty · BH-* property mail.',           tier: 2, sortOrder: 25, gmailLabelName: 'Lime/Beithady',      accentColor: 'teal',    iconName: 'Home' },
  { slug: 'subsidiary_fmplus',   displayName: 'FM+ Work',         description: 'FMPlus tickets, maintenance reports, work correspondence.',           tier: 2, sortOrder: 27, gmailLabelName: 'Lime/FMPlus',        accentColor: 'orange',  iconName: 'Wrench' },
  { slug: 'subsidiary_kika',     displayName: 'KIKA',             description: 'Anything KIKA / X-Label / kika-swim-wear — subsidiary mail.',          tier: 2, sortOrder: 30, gmailLabelName: 'Lime/KIKA',          accentColor: 'pink',    iconName: 'ShoppingBag' },
  { slug: 'newsletters',     displayName: 'Newsletters',          description: 'Opted-in editorial reading — Substack, Stratechery, the like.',       tier: 3, sortOrder: 10, gmailLabelName: 'Lime/Newsletters',   accentColor: 'indigo',  iconName: 'BookOpen' },
  { slug: 'notifications',   displayName: 'Notifications / FYI',  description: 'Automated FYI from services — GitHub, Vercel, calendar reminders.',   tier: 3, sortOrder: 20, gmailLabelName: 'Lime/Notifications', accentColor: 'slate',   iconName: 'Bell' },
  { slug: 'facebook',        displayName: 'Facebook / Meta',      description: 'Facebook, Instagram, Meta business updates and ads notifications.',    tier: 3, sortOrder: 25, gmailLabelName: 'Lime/Facebook',      accentColor: 'blue',    iconName: 'MessageSquare' },
  { slug: 'promotions',      displayName: 'Promotions / Ads',     description: 'Marketing, discount codes, win-back, flash sales.',                   tier: 4, sortOrder: 10, gmailLabelName: 'Lime/Promotions',    accentColor: 'violet',  iconName: 'Tag' },
  { slug: 'spam',            displayName: 'Spam / Junk',          description: 'Outright junk, phishing-shaped, Gmail-flagged spam.',                 tier: 4, sortOrder: 20, gmailLabelName: 'Lime/Spam',          accentColor: 'zinc',    iconName: 'XCircle' },
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

export const TIER_DESCRIPTIONS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Time-sensitive items that need a decision or response today.',
  2: 'Financial paper trail and personal correspondence — keep findable.',
  3: 'FYI feeds you can read on your own time.',
  4: 'Junk — bulk-archive candidates.',
};

export const TIER_ACCENTS: Record<1 | 2 | 3 | 4, string> = {
  1: 'rose',
  2: 'emerald',
  3: 'indigo',
  4: 'zinc',
};

export function getCategory(slug: string): CategoryDef | undefined {
  return CATEGORIES.find(c => c.slug === slug);
}

export function getCategoriesByTier(tier: 1 | 2 | 3 | 4): CategoryDef[] {
  return CATEGORIES.filter(c => c.tier === tier).sort((a, b) => a.sortOrder - b.sortOrder);
}
