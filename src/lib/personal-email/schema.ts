import { z } from 'zod';

export const CATEGORY_SLUGS = [
  'action_required',
  'security',
  'travel',
  'bills_receipts',
  'personal',
  'subsidiary_beithady',
  'subsidiary_kika',
  'newsletters',
  'notifications',
  'promotions',
  'spam',
] as const;

export const CategorySlug = z.enum(CATEGORY_SLUGS);

export const MATCH_TYPES = [
  'from_domain',
  'from_email',
  'subject_contains',
  'header_present',
  'body_contains',
  'gmail_label',
] as const;

export const MatchType = z.enum(MATCH_TYPES);

export const ClassificationMethod = z.enum(['rule', 'ai', 'manual', 'gmail_label']);

export const PersonalEmailCategoryRow = z.object({
  slug: CategorySlug,
  display_name: z.string(),
  tier: z.number().int().min(1).max(4),
  sort_order: z.number().int(),
  gmail_label_name: z.string(),
  accent_color: z.string(),
  icon_name: z.string(),
  is_enabled: z.boolean(),
});

export const PersonalEmailRuleRow = z.object({
  id: z.string().uuid(),
  priority: z.number().int(),
  name: z.string(),
  account_id: z.string().uuid().nullable(),
  match_type: MatchType,
  match_value: z.string(),
  target_category: CategorySlug,
  enabled: z.boolean(),
});

export const PersonalEmailCorrectionRow = z.object({
  id: z.string().uuid(),
  email_log_id: z.string().uuid(),
  old_category: CategorySlug.nullable(),
  new_category: CategorySlug,
  created_at: z.string(),
});

export const ClassificationRunRow = z.object({
  id: z.string().uuid(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  accounts: z.array(z.string()),
  emails_seen: z.number().int(),
  emails_classified: z.number().int(),
  rules_matched: z.number().int(),
  ai_calls: z.number().int(),
  ai_cost_usd: z.number(),
  errors: z.array(z.unknown()),
  trigger: z.enum(['cron', 'manual']),
});

// Output of AI classifier (parsed from Claude response)
export const AiClassificationOutput = z.object({
  category: CategorySlug,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(120),
});
