import { describe, it, expect } from 'vitest';
import { matchRule } from './rule-matcher';
import type { PersonalEmailRule, EmailFeatures } from './types';

const baseFeatures: EmailFeatures = {
  fromAddress: 'noreply@stripe.com',
  fromDomain: 'stripe.com',
  toAddress: 'me@me.com',
  subject: 'Your Stripe receipt',
  hasListUnsubscribe: false,
  gmailLabelIds: [],
  gmailLabelNames: [],
  bodyExcerpt: '',
  receivedIso: null,
};

const baseRule = (over: Partial<PersonalEmailRule>): PersonalEmailRule => ({
  id: '00000000-0000-0000-0000-000000000000',
  priority: 100,
  name: 't',
  account_id: null,
  match_type: 'from_domain',
  match_value: 'stripe.com',
  target_category: 'bills_receipts',
  enabled: true,
  ...over,
});

describe('matchRule', () => {
  it('respects priority order (first match wins)', () => {
    const rules = [
      baseRule({ priority: 50, match_value: 'stripe.com', target_category: 'newsletters' }),
      baseRule({ priority: 10, match_value: 'stripe.com', target_category: 'bills_receipts' }),
    ];
    const m = matchRule(baseFeatures, rules);
    expect(m?.target_category).toBe('bills_receipts'); // priority 10 wins
  });

  it('matches from_domain as suffix (subdomain matches)', () => {
    const f = { ...baseFeatures, fromDomain: 'mail.stripe.com' };
    const m = matchRule(f, [baseRule({ match_type: 'from_domain', match_value: 'stripe.com' })]);
    expect(m).not.toBeNull();
  });

  it('matches subject_contains case-insensitively', () => {
    const m = matchRule(baseFeatures, [baseRule({
      match_type: 'subject_contains', match_value: 'RECEIPT', target_category: 'bills_receipts',
    })]);
    expect(m?.target_category).toBe('bills_receipts');
  });

  it('matches gmail_label exactly', () => {
    const f = { ...baseFeatures, gmailLabelIds: ['SPAM', 'INBOX'] };
    const m = matchRule(f, [baseRule({
      match_type: 'gmail_label', match_value: 'SPAM', target_category: 'spam',
    })]);
    expect(m?.target_category).toBe('spam');
  });

  it('matches header_present (case-insensitive)', () => {
    const f = { ...baseFeatures, hasListUnsubscribe: true };
    const m = matchRule(f, [baseRule({
      match_type: 'header_present', match_value: 'List-Unsubscribe', target_category: 'promotions',
    })]);
    expect(m?.target_category).toBe('promotions');
  });

  it('skips disabled rules', () => {
    const m = matchRule(baseFeatures, [baseRule({ enabled: false })]);
    expect(m).toBeNull();
  });

  it('respects account_id scoping (null = all)', () => {
    const m = matchRule(baseFeatures, [
      baseRule({ account_id: 'bbbb', target_category: 'newsletters' }),
      baseRule({ account_id: null, target_category: 'bills_receipts' }),
    ], 'aaaa');
    expect(m?.target_category).toBe('bills_receipts');
  });

  it('returns null when no rule matches', () => {
    const f = { ...baseFeatures, fromDomain: 'unknown.com', subject: 'hi' };
    expect(matchRule(f, [baseRule({ match_value: 'stripe.com' })])).toBeNull();
  });

  it('to_omits_owner matches when To does not contain account email', () => {
    const f = { ...baseFeatures, toAddress: 'list@blast.example' };
    const m = matchRule(
      f,
      [baseRule({ match_type: 'to_omits_owner', match_value: '', target_category: 'spam' })],
      null,
      'kareem@limeinc.cc',
    );
    expect(m?.target_category).toBe('spam');
  });

  it('to_omits_owner does NOT match when To contains the owner email (case-insensitive)', () => {
    const f = { ...baseFeatures, toAddress: 'KAREEM@LimeInc.cc' };
    const m = matchRule(
      f,
      [baseRule({ match_type: 'to_omits_owner', match_value: '', target_category: 'spam' })],
      null,
      'kareem@limeinc.cc',
    );
    expect(m).toBeNull();
  });

  it('to_omits_owner returns false when accountEmail not supplied (no false positives)', () => {
    const f = { ...baseFeatures, toAddress: 'someone@else.com' };
    const m = matchRule(f, [baseRule({
      match_type: 'to_omits_owner', match_value: '', target_category: 'spam',
    })]);
    expect(m).toBeNull();
  });
});
