import { describe, it, expect } from 'vitest';
import { computeTargetBitrate, pickResolutionRung, compressVideoToFit, VideoCompressError } from './video-compress';

describe('computeTargetBitrate', () => {
  it('targets fit-to-size with 7% container headroom and 96kbps audio reserved', () => {
    const result = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 120 });
    // 50_000_000 * 8 * 0.93 / 120 = 3_100_000 total
    // minus 96_000 audio = 3_004_000 for video
    expect(result.totalBps).toBe(3_100_000);
    expect(result.videoBps).toBe(3_004_000);
  });

  it('handles short clips with high target bitrate', () => {
    const { videoBps } = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 30 });
    // 50e6 * 8 * 0.93 / 30 = 12_400_000 total → 12_304_000 video
    expect(videoBps).toBe(12_304_000);
  });

  it('handles long clips with very low target bitrate', () => {
    const { videoBps } = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 1800 });
    // 50e6 * 8 * 0.93 / 1800 ≈ 206_666 total → 110_666 video
    expect(videoBps).toBe(110_666);
  });

  it('floors fractional bitrates to integer kbps for ffmpeg compatibility', () => {
    const { videoBps } = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 73 });
    expect(Number.isInteger(videoBps)).toBe(true);
  });
});

describe('pickResolutionRung', () => {
  it('keeps source resolution at >= 2 Mbps (1080p source)', () => {
    const r = pickResolutionRung({ videoBps: 2_000_000, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('caps source resolution at 1080p when source is larger', () => {
    const r = pickResolutionRung({ videoBps: 5_000_000, srcWidth: 3840, srcHeight: 2160 });
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('drops to 720p between 800k and 2M', () => {
    const r = pickResolutionRung({ videoBps: 1_500_000, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 1280, height: 720 });
  });

  it('drops to 720p at the 800k boundary', () => {
    const r = pickResolutionRung({ videoBps: 800_000, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 1280, height: 720 });
  });

  it('drops to 480p below 800k', () => {
    const r = pickResolutionRung({ videoBps: 799_999, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 854, height: 480 });
  });

  it('preserves aspect ratio for portrait video', () => {
    const r = pickResolutionRung({ videoBps: 1_500_000, srcWidth: 1080, srcHeight: 1920 });
    // 720 rung but portrait: height limited to 1280, width keeps aspect
    expect(r.width).toBeLessThanOrEqual(1280);
    expect(r.height).toBeLessThanOrEqual(1280);
    // aspect ratio ~= 9:16 preserved within 1px tolerance
    expect(Math.abs(r.width / r.height - 1080 / 1920)).toBeLessThan(0.01);
  });

  it('never upscales a tiny source', () => {
    const r = pickResolutionRung({ videoBps: 5_000_000, srcWidth: 640, srcHeight: 360 });
    expect(r).toEqual({ width: 640, height: 360 });
  });
});

describe('compressVideoToFit fast-path', () => {
  it('returns the same File instance when file.size <= maxBytes', async () => {
    const small = new File([new Uint8Array(1_000_000)], 'small.mp4', { type: 'video/mp4' });
    const result = await compressVideoToFit(small);
    expect(result).toBe(small);
  });

  it('returns the same File instance for non-video MIMEs even when oversized', async () => {
    const big = new File([new Uint8Array(60_000_000)], 'huge.pdf', { type: 'application/pdf' });
    const result = await compressVideoToFit(big);
    expect(result).toBe(big);
  });

  it('honors a custom maxBytes', async () => {
    const file = new File([new Uint8Array(2_000_000)], 'clip.mp4', { type: 'video/mp4' });
    const result = await compressVideoToFit(file, { maxBytes: 3_000_000 });
    expect(result).toBe(file);
  });

  it('emits a done progress event on the fast-path', async () => {
    const file = new File([new Uint8Array(1_000)], 'tiny.mp4', { type: 'video/mp4' });
    const seen: string[] = [];
    await compressVideoToFit(file, { onProgress: (p) => seen.push(p.phase) });
    expect(seen).toContain('done');
  });
});

describe('VideoCompressError', () => {
  it('preserves code and name', () => {
    const err = new VideoCompressError('boom', 'encode_failed');
    expect(err.code).toBe('encode_failed');
    expect(err.name).toBe('VideoCompressError');
    expect(err.message).toBe('boom');
  });
});
