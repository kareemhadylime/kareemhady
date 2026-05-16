// Strip tracking artifacts from a plain-text email body so the
// drill-down view shows the human-readable content, not the
// template tokens and redirect URLs that ESPs inline.
//
// Applied at display time only — the raw text remains in
// `email_logs.body_excerpt` for AI classification and forensics.

const TRACKING_URL_PATTERNS: RegExp[] = [
  /https?:\/\/email\.guesty\.com\/c\/\S+/g,
  /https?:\/\/click\.[^\s]+/g,
  /https?:\/\/([a-z0-9.-]+\.)?mandrillapp\.com\/track\/\S+/g,
  /https?:\/\/([a-z0-9.-]+\.)?sendgrid\.net\/\S+/g,
];

const TEMPLATE_TOKEN_LINE = /^%[a-z0-9_-]+%\s*$/gim;
const COLLAPSE_BLANK_RUNS = /\n{3,}/g;

export function sanitizeBodyExcerptForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  let out = raw;
  for (const re of TRACKING_URL_PATTERNS) {
    out = out.replace(re, '');
  }
  out = out.replace(TEMPLATE_TOKEN_LINE, '');
  out = out.replace(COLLAPSE_BLANK_RUNS, '\n\n');
  return out.trim();
}
