import { describe, it, expect } from 'vitest';
import { parseInstagramUrl } from './instagram-url';

describe('parseInstagramUrl', () => {
  it('parses /reel/{shortcode}/', () => {
    const r = parseInstagramUrl('https://www.instagram.com/reel/Cxyz1234abc/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shortcode).toBe('Cxyz1234abc');
      expect(r.mediaKind).toBe('reel');
      expect(r.canonicalUrl).toBe('https://www.instagram.com/reel/Cxyz1234abc/');
    }
  });

  it('parses /p/{shortcode}/', () => {
    const r = parseInstagramUrl('https://www.instagram.com/p/Cxyz1234abc/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mediaKind).toBe('post');
      expect(r.canonicalUrl).toBe('https://www.instagram.com/p/Cxyz1234abc/');
    }
  });

  it('parses /tv/{shortcode}/', () => {
    const r = parseInstagramUrl('https://www.instagram.com/tv/Cxyz1234abc/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mediaKind).toBe('tv');
  });

  it('parses newer /{username}/reel/{shortcode} format', () => {
    const r = parseInstagramUrl('https://www.instagram.com/beithady/reel/Cxyz1234abc/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mediaKind).toBe('reel');
      expect(r.shortcode).toBe('Cxyz1234abc');
      expect(r.canonicalUrl).toBe('https://www.instagram.com/reel/Cxyz1234abc/');
    }
  });

  it('parses no-www host', () => {
    const r = parseInstagramUrl('https://instagram.com/reel/Cxyz1234abc/');
    expect(r.ok).toBe(true);
  });

  it('parses m.instagram.com', () => {
    const r = parseInstagramUrl('https://m.instagram.com/reel/Cxyz1234abc/');
    expect(r.ok).toBe(true);
  });

  it('ignores trailing query string', () => {
    const r = parseInstagramUrl(
      'https://www.instagram.com/reel/Cxyz1234abc/?utm_source=ig_web_copy_link'
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonicalUrl).toBe('https://www.instagram.com/reel/Cxyz1234abc/');
  });

  it('handles missing trailing slash', () => {
    const r = parseInstagramUrl('https://www.instagram.com/reel/Cxyz1234abc');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shortcode).toBe('Cxyz1234abc');
  });

  it('trims whitespace', () => {
    const r = parseInstagramUrl('  https://www.instagram.com/reel/Cxyz1234abc/  ');
    expect(r.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const r = parseInstagramUrl('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects non-URL input', () => {
    const r = parseInstagramUrl('not a url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_url');
  });

  it('rejects non-Instagram host', () => {
    const r = parseInstagramUrl('https://www.tiktok.com/@beithady/video/123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_instagram');
  });

  it('rejects profile page (no media)', () => {
    const r = parseInstagramUrl('https://www.instagram.com/beithady/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_format');
  });

  it('rejects unknown path types (e.g. /stories/)', () => {
    const r = parseInstagramUrl('https://www.instagram.com/stories/beithady/12345/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_format');
  });

  it('rejects shortcode with invalid characters', () => {
    const r = parseInstagramUrl('https://www.instagram.com/reel/Cxy z%/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_format');
  });
});
