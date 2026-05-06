import { describe, it, expect } from 'vitest';
import { extractFeatures, parseFromDomain } from './feature-extractor';

describe('parseFromDomain', () => {
  it('extracts the domain from a quoted-name address', () => {
    expect(parseFromDomain('"Stripe" <noreply@stripe.com>')).toBe('stripe.com');
  });
  it('handles bare addresses', () => {
    expect(parseFromDomain('alice@example.com')).toBe('example.com');
  });
  it('lowercases the result', () => {
    expect(parseFromDomain('Bob <BOB@COMPANY.COM>')).toBe('company.com');
  });
  it('returns empty string for malformed input', () => {
    expect(parseFromDomain('not-an-email')).toBe('');
  });
});

describe('extractFeatures', () => {
  it('detects List-Unsubscribe header (case-insensitive)', () => {
    const f = extractFeatures({
      headers: { from: 'a@b.com', to: 'me@me.com', subject: 's', 'list-unsubscribe': '<https://x>' },
      bodyExcerpt: '',
      gmailLabelIds: [],
    });
    expect(f.hasListUnsubscribe).toBe(true);
  });

  it('returns false when List-Unsubscribe is missing', () => {
    const f = extractFeatures({
      headers: { from: 'a@b.com', to: 'me@me.com', subject: 's' },
      bodyExcerpt: '',
      gmailLabelIds: [],
    });
    expect(f.hasListUnsubscribe).toBe(false);
  });

  it('strips whitespace from subject', () => {
    const f = extractFeatures({
      headers: { from: 'a@b.com', to: 'me@me.com', subject: '  Hello  ' },
      bodyExcerpt: '',
      gmailLabelIds: [],
    });
    expect(f.subject).toBe('Hello');
  });
});
