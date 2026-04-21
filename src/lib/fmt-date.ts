// Dashboard timestamps are always rendered in Cairo local time. The Beithady
// operations happen in Egypt; internal ops (runs, mails) happen in Cairo.
// Using the IANA "Africa/Cairo" timezone identifier lets the runtime handle
// DST automatically — Egypt observes EEST (UTC+3) from the last Friday of
// April through the last Thursday of October, EET (UTC+2) otherwise.
//
// Locale pinned to en-US so the format is stable across server (UTC default)
// and client renders. Matches the existing "4/21/2026, 8:45:35 AM" style.

const CAIRO_TZ = 'Africa/Cairo';
const LOCALE = 'en-US';

export function fmtCairoDateTime(
  iso: string | Date | null | undefined
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function fmtCairoDate(
  iso: string | Date | null | undefined
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE, {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}
