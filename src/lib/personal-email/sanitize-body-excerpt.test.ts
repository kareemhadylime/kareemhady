import { describe, it, expect } from 'vitest';
import { sanitizeBodyExcerptForDisplay } from './sanitize-body-excerpt';

describe('sanitizeBodyExcerptForDisplay', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(sanitizeBodyExcerptForDisplay(null)).toBe('');
    expect(sanitizeBodyExcerptForDisplay(undefined)).toBe('');
    expect(sanitizeBodyExcerptForDisplay('')).toBe('');
  });

  it('drops %opentrack% template token lines', () => {
    const input = '%opentrack%\n\nReal content here.';
    expect(sanitizeBodyExcerptForDisplay(input)).toBe('Real content here.');
  });

  it('drops other %token% lines like %merge_data% or %footer-link%', () => {
    const input = '%merge_data%\nHello.\n%footer-link%';
    expect(sanitizeBodyExcerptForDisplay(input)).toBe('Hello.');
  });

  it('strips Guesty click-tracking URLs', () => {
    const input =
      'New booking.\n\nhttps://email.guesty.com/c/eJwUz7tuqzAYAOCnMRvI2AHbg4cT5RC1qhl\n\nView reservation.';
    const out = sanitizeBodyExcerptForDisplay(input);
    expect(out).not.toContain('email.guesty.com');
    expect(out).toContain('New booking.');
    expect(out).toContain('View reservation.');
  });

  it('strips Mandrill and Sendgrid tracking URLs', () => {
    const input =
      'Hi.\nhttps://mandrillapp.com/track/click/abc123\nhttps://click.something.io/u/xyz\nhttps://sub.sendgrid.net/ls/click?upn=foo\nBye.';
    const out = sanitizeBodyExcerptForDisplay(input);
    expect(out).not.toContain('mandrillapp.com');
    expect(out).not.toContain('click.something.io');
    expect(out).not.toContain('sendgrid.net');
    expect(out).toContain('Hi.');
    expect(out).toContain('Bye.');
  });

  it('collapses 3+ consecutive newlines into 2', () => {
    const input = 'A\n\n\n\n\nB';
    expect(sanitizeBodyExcerptForDisplay(input)).toBe('A\n\nB');
  });

  it('preserves non-tracking URLs untouched', () => {
    const input = 'See https://lime-investments.com for details.';
    expect(sanitizeBodyExcerptForDisplay(input)).toBe(
      'See https://lime-investments.com for details.',
    );
  });

  it('handles the full Guesty reservation-email pattern from the screenshot', () => {
    const input = `%opentrack%

https://email.guesty.com/c/eJwUz7tuqzAYAOCnMRvI2AHbg4cT5RC1qhl

NEW BOOKING CONFIRMED! MINA ARRIVES JUN 20.

Send a message to confirm check-in details or welcome Mina.

https://email.guesty.com/c/eJwUyOFvmzAUAOBfY24g85wY`;
    const out = sanitizeBodyExcerptForDisplay(input);
    expect(out).not.toContain('%opentrack%');
    expect(out).not.toContain('email.guesty.com');
    expect(out).toContain('NEW BOOKING CONFIRMED');
    expect(out).toContain('check-in details');
    // Should not start or end with blank lines.
    expect(out).toMatch(/^NEW BOOKING/);
    expect(out).toMatch(/Mina\.$/);
  });
});
