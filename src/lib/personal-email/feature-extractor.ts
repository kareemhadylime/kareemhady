import type { EmailFeatures } from './types';

export type RawHeaderMap = Record<string, string | undefined>;

export type FeatureInput = {
  headers: RawHeaderMap;
  bodyExcerpt: string;
  gmailLabelIds: string[];
  gmailLabelNames?: string[];
};

// Lowercases the header map and looks up by lowercase key. Gmail's API
// returns headers with mixed case (`From`, `To`, `Subject`, `List-Unsubscribe`).
function getHeader(h: RawHeaderMap, name: string): string {
  const lower = name.toLowerCase();
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === lower) return (h[k] ?? '').toString();
  }
  return '';
}

const ANGLE_RE = /<([^>]+)>/;

export function parseFromDomain(fromHeader: string): string {
  if (!fromHeader) return '';
  // Either `Name <addr@host>` or bare `addr@host`.
  const m = fromHeader.match(ANGLE_RE);
  const addr = (m ? m[1] : fromHeader).trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at < 0 || at === addr.length - 1) return '';
  return addr.slice(at + 1);
}

export function parseFromAddress(fromHeader: string): string {
  if (!fromHeader) return '';
  const m = fromHeader.match(ANGLE_RE);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

export function extractFeatures(input: FeatureInput): EmailFeatures {
  const fromHeader = getHeader(input.headers, 'from');
  return {
    fromAddress: parseFromAddress(fromHeader),
    fromDomain: parseFromDomain(fromHeader),
    toAddress: getHeader(input.headers, 'to').trim().toLowerCase(),
    subject: getHeader(input.headers, 'subject').trim(),
    hasListUnsubscribe: !!getHeader(input.headers, 'list-unsubscribe'),
    gmailLabelIds: input.gmailLabelIds,
    gmailLabelNames: input.gmailLabelNames ?? [],
    bodyExcerpt: input.bodyExcerpt,
    receivedIso: null,
  };
}
