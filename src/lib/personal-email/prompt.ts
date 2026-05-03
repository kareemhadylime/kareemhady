import type { CategorySlug } from './types';
import type { CorrectionExample } from './corrections';

const DEFINITIONS = `Categories:
- action_required: A real human is awaiting MY reply, or has issued a request/deadline directly to me. NOT automated. NOT just FYI.
- security: 2FA codes, login alerts, password resets, account changes (bank, social, dev tooling, infra providers).
- travel: Flight, hotel, ride-share, car-rental confirmations and itinerary changes.
- bills_receipts: Invoices, payment confirmations, statements, refunds. Financial paper trail.
- personal: One-to-one correspondence from a real human (friend, family, contact). NOT a list, NOT automated, NOT a work request.
- newsletters: Opted-in editorial content (Substack, Stratechery, curated analysis).
- notifications: Automated FYI from services (GitHub PRs, Vercel deploys, Slack daily summaries, calendar reminders).
- promotions: Marketing, discount codes, win-back, flash sales, product announcements.
- spam: Outright junk, phishing-shaped, or pre-flagged by Gmail's SPAM label.`;

const OUTPUT_SCHEMA = `Output JSON only, no prose:
{"category": "<one of 9 slugs>", "confidence": <0.0-1.0>, "reason": "<≤12 words>"}

If confidence < 0.7, the system flags this email for human review.`;

export function buildSystemPrompt(
  recentByCategory: Record<CategorySlug, CorrectionExample[]> | Record<string, CorrectionExample[]>,
): string {
  const fewShot = formatFewShot(recentByCategory);
  return [
    'You classify emails into one of 9 categories.',
    '',
    DEFINITIONS,
    '',
    'Recent user corrections (treat as ground truth — they fixed the AI):',
    fewShot.length ? fewShot : '(none yet)',
    '',
    OUTPUT_SCHEMA,
  ].join('\n');
}

function formatFewShot(
  byCat: Record<string, CorrectionExample[]>,
): string {
  const lines: string[] = [];
  for (const [cat, exs] of Object.entries(byCat)) {
    if (!exs.length) continue;
    for (const e of exs) {
      lines.push(`- ${cat}: from=${e.fromAddress} subject="${e.subject.slice(0, 80)}"`);
    }
  }
  return lines.join('\n');
}

export function buildUserMessage(args: {
  fromHeader: string;
  toHeader: string;
  subject: string;
  hasListUnsubscribe: boolean;
  gmailLabelIds: string[];
  bodyExcerpt: string;
  accountDisplayName: string;
}): string {
  // Cap excerpt to ~1KB to keep input tokens predictable (spec §12).
  const excerpt = args.bodyExcerpt.slice(0, 1024);
  return [
    `From: ${args.fromHeader}`,
    `To: ${args.toHeader}`,
    `Subject: ${args.subject}`,
    `Has-List-Unsubscribe: ${args.hasListUnsubscribe ? 'yes' : 'no'}`,
    `Gmail-Labels: ${args.gmailLabelIds.join(',')}`,
    `Account: ${args.accountDisplayName}`,
    '',
    'Body excerpt:',
    '"""',
    excerpt,
    '"""',
  ].join('\n');
}
