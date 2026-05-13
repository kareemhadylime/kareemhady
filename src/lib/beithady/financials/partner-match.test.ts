import { describe, it, expect } from 'vitest';
import { normalizePartnerName, scoreMatch, matchPartners } from './partner-match';

describe('normalizePartnerName', () => {
  it('strips leading numeric prefix "020. "', () => {
    expect(normalizePartnerName('020. B.Tech')).toBe('b.tech');
  });
  it('strips trailing numeric suffix ".138"', () => {
    expect(normalizePartnerName('مؤسسة بيور الدولية.138')).toBe('مؤسسة بيور الدولية');
  });
  it('lowercases and trims', () => {
    expect(normalizePartnerName('  Foo Bar  ')).toBe('foo bar');
  });
  it('collapses double spaces', () => {
    expect(normalizePartnerName('Foo  Bar')).toBe('foo bar');
  });
});

describe('scoreMatch', () => {
  it('returns 1.0 for identical normalized names', () => {
    expect(scoreMatch('foo bar', 'foo bar')).toBe(1.0);
  });
  it('returns >0.85 for "adel fathy it industrial" vs "adel fathy (it industrial)"', () => {
    const s = scoreMatch('adel fathy (it industrial)', 'adel fathy it industrial');
    expect(s).toBeGreaterThan(0.85);
  });
  it('returns <0.5 for unrelated names', () => {
    expect(scoreMatch('b.tech', 'amazon')).toBeLessThan(0.5);
  });
});

describe('matchPartners', () => {
  const directory = [
    { id: 1, name: 'B.Tech' },
    { id: 2, name: 'Amazon' },
    { id: 3, name: 'Adel Fathy IT Industrial' },
  ];
  it('tags exact matches', () => {
    const out = matchPartners([{ raw: '020. B.Tech', balance: -100 }], directory);
    expect(out[0].confidence).toBe('exact');
    expect(out[0].partner_id).toBe(1);
  });
  it('tags fuzzy with score', () => {
    const out = matchPartners(
      [{ raw: '034 . Adel Fathy (it industrial)', balance: -100 }],
      directory
    );
    expect(out[0].confidence).toBe('fuzzy');
    expect(out[0].partner_id).toBe(3);
    expect(out[0].score).toBeGreaterThan(0.85);
  });
  it('tags unmatched when no candidate clears threshold', () => {
    const out = matchPartners([{ raw: 'Some Random Name', balance: -100 }], directory);
    expect(out[0].confidence).toBe('unmatched');
    expect(out[0].partner_id).toBeNull();
  });
});
