import { describe, it, expect } from 'vitest';
import { parseRangeEnd, decideUploadPath } from './youtube-publish';

describe('parseRangeEnd', () => {
  it('parses YouTube resumable Range header', () => {
    expect(parseRangeEnd('bytes=0-8388607')).toBe(8388607);
  });

  it('returns -1 on null', () => {
    expect(parseRangeEnd(null)).toBe(-1);
  });

  it('returns -1 on malformed', () => {
    expect(parseRangeEnd('garbage')).toBe(-1);
  });
});

describe('decideUploadPath', () => {
  it('returns sync for 50s 100MB file', () => {
    expect(decideUploadPath({ duration_seconds: 50, file_size_bytes: 100 * 1024 * 1024 })).toBe('sync');
  });

  it('returns async for 70s file (over duration cap)', () => {
    expect(decideUploadPath({ duration_seconds: 70, file_size_bytes: 50 * 1024 * 1024 })).toBe('async');
  });

  it('returns async for 30s 250MB file (over size cap)', () => {
    expect(decideUploadPath({ duration_seconds: 30, file_size_bytes: 250 * 1024 * 1024 })).toBe('async');
  });

  it('returns async when duration is unknown', () => {
    expect(decideUploadPath({ duration_seconds: undefined, file_size_bytes: 10 * 1024 * 1024 })).toBe('async');
  });
});
