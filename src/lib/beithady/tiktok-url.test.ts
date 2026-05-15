import { describe, it, expect } from 'vitest';
import { parseTikTokUrl } from './tiktok-url';

describe('parseTikTokUrl', () => {
  it('parses canonical www.tiktok.com URL', () => {
    const r = parseTikTokUrl('https://www.tiktok.com/@beithady/video/7234567890123456789');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.videoId).toBe('7234567890123456789');
      expect(r.username).toBe('@beithady');
      expect(r.canonicalUrl).toBe('https://www.tiktok.com/@beithady/video/7234567890123456789');
    }
  });

  it('parses tiktok.com (no www) URL', () => {
    const r = parseTikTokUrl('https://tiktok.com/@beithady/video/7234567890123456789');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.videoId).toBe('7234567890123456789');
  });

  it('parses m.tiktok.com URL', () => {
    const r = parseTikTokUrl('https://m.tiktok.com/@beithady/video/7234567890123456789');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.videoId).toBe('7234567890123456789');
  });

  it('strips trailing slash and ignores query params', () => {
    const r = parseTikTokUrl(
      'https://www.tiktok.com/@beithady/video/7234567890123456789/?is_from_webapp=1&sender_device=pc'
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.videoId).toBe('7234567890123456789');
  });

  it('canonicalizes the URL (drops query, keeps path)', () => {
    const r = parseTikTokUrl(
      'https://www.tiktok.com/@beithady/video/7234567890123456789?foo=bar'
    );
    if (r.ok) {
      expect(r.canonicalUrl).toBe('https://www.tiktok.com/@beithady/video/7234567890123456789');
    }
  });

  it('trims whitespace', () => {
    const r = parseTikTokUrl('   https://www.tiktok.com/@beithady/video/7234567890123456789  ');
    expect(r.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const r = parseTikTokUrl('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects whitespace-only string', () => {
    const r = parseTikTokUrl('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects malformed URL', () => {
    const r = parseTikTokUrl('not a url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_url');
  });

  it('rejects non-TikTok host', () => {
    const r = parseTikTokUrl('https://www.youtube.com/watch?v=abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_tiktok');
  });

  it('rejects vm.tiktok.com short URLs with helpful message', () => {
    const r = parseTikTokUrl('https://vm.tiktok.com/ZMABCDEF/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('short_url');
      expect(r.message).toMatch(/full URL/i);
    }
  });

  it('rejects vt.tiktok.com short URLs', () => {
    const r = parseTikTokUrl('https://vt.tiktok.com/ZTABCDEF/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('short_url');
  });

  it('rejects tiktok.com/t/ share URLs', () => {
    const r = parseTikTokUrl('https://www.tiktok.com/t/ZTABCDEF/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('short_url');
  });

  it('rejects profile page (no /video/)', () => {
    const r = parseTikTokUrl('https://www.tiktok.com/@beithady');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_format');
  });

  it('rejects /video/ with non-numeric id', () => {
    const r = parseTikTokUrl('https://www.tiktok.com/@beithady/video/abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_format');
  });
});
