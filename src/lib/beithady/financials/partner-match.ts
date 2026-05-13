// Fuzzy partner-name matching for ledger imports. Pure functions.
// Strategy: normalize → exact lookup → token-set similarity → threshold.

const NUMERIC_PREFIX = /^[\d]+\s*[.\-]\s*/; // "020. " or "034 - "
const NUMERIC_SUFFIX = /\s*\.[\d]+$/; // ".138"

export function normalizePartnerName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(NUMERIC_PREFIX, '')
    .replace(NUMERIC_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(/[\s()\-]+/).filter(Boolean));
}

/** Jaccard similarity on token sets. Symmetric, 0..1. */
export function scoreMatch(a: string, b: string): number {
  if (a === b) return 1.0;
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return inter / union;
}

export type MatchInput = { raw: string; balance: number };
export type MatchResult = {
  raw: string;
  normalized: string;
  balance: number;
  partner_id: number | null;
  matched_name: string | null;
  confidence: 'exact' | 'fuzzy' | 'unmatched';
  score: number | null;
};

const FUZZY_THRESHOLD = 0.7;

export function matchPartners(
  inputs: MatchInput[],
  directory: Array<{ id: number; name: string }>,
): MatchResult[] {
  const directoryNormalized = directory.map((p) => ({
    ...p,
    normalized: normalizePartnerName(p.name),
  }));
  const byNorm = new Map<string, { id: number; name: string }>();
  for (const p of directoryNormalized) byNorm.set(p.normalized, p);

  return inputs.map((inp) => {
    const norm = normalizePartnerName(inp.raw);
    const exact = byNorm.get(norm);
    if (exact) {
      return {
        raw: inp.raw,
        normalized: norm,
        balance: inp.balance,
        partner_id: exact.id,
        matched_name: exact.name,
        confidence: 'exact',
        score: 1.0,
      };
    }
    let best: { id: number; name: string; score: number } | null = null;
    for (const p of directoryNormalized) {
      const s = scoreMatch(norm, p.normalized);
      if (!best || s > best.score) best = { id: p.id, name: p.name, score: s };
    }
    if (best && best.score >= FUZZY_THRESHOLD) {
      return {
        raw: inp.raw,
        normalized: norm,
        balance: inp.balance,
        partner_id: best.id,
        matched_name: best.name,
        confidence: 'fuzzy',
        score: best.score,
      };
    }
    return {
      raw: inp.raw,
      normalized: norm,
      balance: inp.balance,
      partner_id: null,
      matched_name: null,
      confidence: 'unmatched',
      score: best?.score ?? null,
    };
  });
}
