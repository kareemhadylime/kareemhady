// src/lib/beithady/youtube/ai-metadata.test.ts
import { describe, it, expect } from 'vitest';
import { parseAiJson, clampTitle, clampTags, substituteBookingUrl, substitutePlaceholders } from './ai-metadata';

describe('parseAiJson', () => {
  it('parses raw JSON', () => {
    expect(parseAiJson('{"title":"hi"}')).toEqual({ title: 'hi' });
  });

  it('parses JSON wrapped in ```json fence', () => {
    expect(parseAiJson('```json\n{"title":"hi"}\n```')).toEqual({ title: 'hi' });
  });

  it('parses JSON wrapped in plain ``` fence', () => {
    expect(parseAiJson('```\n{"title":"hi"}\n```')).toEqual({ title: 'hi' });
  });

  it('returns null when no JSON object found', () => {
    expect(parseAiJson('no json here')).toBeNull();
  });
});

describe('clampTitle', () => {
  it('returns input when under limit', () => {
    expect(clampTitle('short title', 100)).toBe('short title');
  });

  it('truncates to limit', () => {
    const long = 'a'.repeat(150);
    expect(clampTitle(long, 100).length).toBe(100);
  });
});

describe('clampTags', () => {
  it('deduplicates case-insensitively', () => {
    expect(clampTags(['Cairo', 'cairo', 'Egypt'], 500)).toEqual(['Cairo', 'Egypt']);
  });

  it('respects total char budget', () => {
    const tags = ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100), 'd'.repeat(100), 'e'.repeat(100), 'f'.repeat(100)];
    const result = clampTags(tags, 250);
    expect(result.join('').length).toBeLessThanOrEqual(250);
  });
});

describe('substituteBookingUrl', () => {
  it('replaces {booking_url} with the booking URL', () => {
    expect(substituteBookingUrl('Visit {booking_url} today')).toContain('beithady');
  });

  it('handles strings without the placeholder', () => {
    expect(substituteBookingUrl('no placeholder here')).toBe('no placeholder here');
  });
});

describe('substitutePlaceholders', () => {
  it('replaces {whatsapp_url} with the wa.me URL', () => {
    const result = substitutePlaceholders('Reserve → {whatsapp_url}');
    expect(result).toContain('wa.me');
    expect(result).toContain('201501010103');
  });

  it('replaces BOTH {booking_url} and {whatsapp_url} in one pass', () => {
    const result = substitutePlaceholders('Book {booking_url} or WA {whatsapp_url}');
    expect(result).toContain('beithady.com');
    expect(result).toContain('wa.me');
    expect(result).not.toContain('{booking_url}');
    expect(result).not.toContain('{whatsapp_url}');
  });
});
