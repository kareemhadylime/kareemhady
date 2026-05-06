import type { PersonalEmailRule, EmailFeatures } from './types';

// Pure function: given features + an ordered rule set, return the
// first matching rule (lowest priority value wins) or null.
//
// `accountId` scopes which account-bound rules can match. `account_id IS
// NULL` rules are global and always considered.
//
// `accountEmail` is the email address of the mailbox this email arrived
// in — used by the owner-relative `to_omits_owner` match type. Pass
// the account's `accounts.email` from the caller (pipeline.ts).
export function matchRule(
  features: EmailFeatures,
  rules: PersonalEmailRule[],
  accountId: string | null = null,
  accountEmail: string | null = null,
): PersonalEmailRule | null {
  // Sort by priority ascending (lower = higher precedence). Defensive:
  // caller may not have sorted.
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (!r.enabled) continue;
    if (r.account_id && r.account_id !== accountId) continue;
    if (matches(features, r, accountEmail)) return r;
  }
  return null;
}

function matches(
  f: EmailFeatures,
  r: PersonalEmailRule,
  accountEmail: string | null,
): boolean {
  const v = r.match_value;
  const vLower = v.toLowerCase();
  switch (r.match_type) {
    case 'from_domain': {
      const dom = f.fromDomain.toLowerCase();
      return dom === vLower || dom.endsWith('.' + vLower);
    }
    case 'from_email':
      return f.fromAddress.toLowerCase() === vLower;
    case 'subject_contains':
      return f.subject.toLowerCase().includes(vLower);
    case 'body_contains':
      return f.bodyExcerpt.toLowerCase().includes(vLower);
    case 'header_present':
      // v1: only `List-Unsubscribe` is exposed via the EmailFeatures
      // shape. Other headers would require expanding the extractor.
      if (vLower === 'list-unsubscribe') return f.hasListUnsubscribe;
      return false;
    case 'gmail_label':
      return f.gmailLabelIds.includes(v) || f.gmailLabelNames.includes(v);
    case 'to_omits_owner': {
      // Fires when the To header doesn't contain the mailbox owner's
      // email — i.e. broadcast/list-blast that wasn't personally
      // addressed. `match_value` is ignored for this type.
      if (!accountEmail) return false;
      return !f.toAddress.toLowerCase().includes(accountEmail.toLowerCase());
    }
  }
}
