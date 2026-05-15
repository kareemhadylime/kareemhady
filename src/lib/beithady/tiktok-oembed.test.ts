import { describe, it, expect, vi } from 'vitest';
import { fetchTikTokOEmbed } from './tiktok-oembed';

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  return vi.fn(async () => response as Response);
}

describe('fetchTikTokOEmbed', () => {
  it('parses a successful oEmbed response', async () => {
    const fetchImpl = mockFetch({
      ok: true,
      json: async () => ({
        title: 'Sunset reel at BH-435 #beithady',
        author_name: 'Beit Hady',
        author_url: 'https://www.tiktok.com/@beithady',
        thumbnail_url: 'https://p16.tiktokcdn.com/abc.jpg',
        extra_field: 'ignored',
      }),
    });

    const got = await fetchTikTokOEmbed(
      'https://www.tiktok.com/@beithady/video/7234567890123456789',
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(got.title).toBe('Sunset reel at BH-435 #beithady');
    expect(got.author_name).toBe('Beit Hady');
    expect(got.author_url).toBe('https://www.tiktok.com/@beithady');
    expect(got.thumbnail_url).toBe('https://p16.tiktokcdn.com/abc.jpg');
  });

  it('encodes the URL into the query string', async () => {
    const fetchImpl = mockFetch({ ok: true, json: async () => ({}) });
    await fetchTikTokOEmbed('https://www.tiktok.com/@user/video/123', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const call = (fetchImpl as unknown as { mock: { calls: Array<[string, unknown]> } }).mock.calls[0];
    const calledUrl = String(call[0]);
    expect(calledUrl).toBe(
      'https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F123'
    );
  });

  it('returns empty fields on non-2xx response', async () => {
    const fetchImpl = mockFetch({ ok: false, json: async () => ({}) });
    const got = await fetchTikTokOEmbed('https://www.tiktok.com/@user/video/123', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(got).toEqual({
      title: null,
      author_name: null,
      author_url: null,
      thumbnail_url: null,
    });
  });

  it('returns empty fields when fetch throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const got = await fetchTikTokOEmbed('https://www.tiktok.com/@user/video/123', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(got.title).toBeNull();
    expect(got.thumbnail_url).toBeNull();
  });

  it('returns empty fields when response is missing expected fields', async () => {
    const fetchImpl = mockFetch({
      ok: true,
      json: async () => ({ title: 123, author_name: null, thumbnail_url: { wrong: 'type' } }),
    });
    const got = await fetchTikTokOEmbed('https://www.tiktok.com/@user/video/123', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(got.title).toBeNull();
    expect(got.author_name).toBeNull();
    expect(got.thumbnail_url).toBeNull();
  });
});
