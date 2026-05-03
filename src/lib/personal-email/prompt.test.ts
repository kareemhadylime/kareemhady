import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage } from './prompt';

describe('buildSystemPrompt', () => {
  it('lists all 9 categories', () => {
    const sp = buildSystemPrompt({});
    for (const slug of [
      'action_required','security','travel','bills_receipts','personal',
      'newsletters','notifications','promotions','spam',
    ]) {
      expect(sp).toContain(slug + ':');
    }
  });

  it('embeds few-shot corrections when provided', () => {
    const sp = buildSystemPrompt({
      action_required: [{ category: 'action_required', fromAddress: 'a@b.com', subject: 'Hi' }],
    } as any);
    expect(sp).toContain('a@b.com');
    expect(sp).toContain('Hi');
  });

  it('outputs the JSON schema sentinel', () => {
    expect(buildSystemPrompt({})).toContain('"category"');
    expect(buildSystemPrompt({})).toContain('"confidence"');
  });
});

describe('buildUserMessage', () => {
  it('formats headers + body excerpt', () => {
    const u = buildUserMessage({
      fromHeader: '"Stripe" <noreply@stripe.com>',
      toHeader: 'me@me.com',
      subject: 'Receipt',
      hasListUnsubscribe: true,
      gmailLabelIds: ['INBOX'],
      bodyExcerpt: 'Thanks for your payment',
      accountDisplayName: 'GMAIL',
    });
    expect(u).toContain('From: "Stripe" <noreply@stripe.com>');
    expect(u).toContain('Subject: Receipt');
    expect(u).toContain('Has-List-Unsubscribe: yes');
    expect(u).toContain('Account: GMAIL');
    expect(u).toContain('Thanks for your payment');
  });
});
