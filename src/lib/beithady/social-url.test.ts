import { describe, it, expect } from 'vitest';
import { parseSocialUrl } from './social-url';

describe('parseSocialUrl', () => {
  it('routes tiktok.com URL → tiktok parser', () => {
    const r = parseSocialUrl('https://www.tiktok.com/@beithady/video/7234567890123456789');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.platform).toBe('tiktok');
      expect(r.externalId).toBe('7234567890123456789');
      if (r.platform === 'tiktok') expect(r.username).toBe('@beithady');
    }
  });

  it('routes instagram.com URL → instagram parser', () => {
    const r = parseSocialUrl('https://www.instagram.com/reel/Cxyz1234abc/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.platform).toBe('instagram');
      expect(r.externalId).toBe('Cxyz1234abc');
      if (r.platform === 'instagram') expect(r.mediaKind).toBe('reel');
    }
  });

  it('routes m.tiktok.com URL → tiktok parser', () => {
    const r = parseSocialUrl('https://m.tiktok.com/@beithady/video/7234567890123456789');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platform).toBe('tiktok');
  });

  it('rejects URL from unsupported platform (e.g. YouTube)', () => {
    const r = parseSocialUrl('https://www.youtube.com/watch?v=abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported_platform');
  });

  it('rejects empty input', () => {
    const r = parseSocialUrl('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects malformed URL', () => {
    const r = parseSocialUrl('not a url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_url');
  });

  it('forwards TikTok short-URL error message verbatim', () => {
    const r = parseSocialUrl('https://vm.tiktok.com/ZMABCDEF/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('short_url');
      expect(r.message).toMatch(/full URL/i);
    }
  });
});
