// Phase Q.2 — message templates shared types + client-safe variable
// resolver. Mirrors warehouses-shared / estimator-shared pattern: no
// `server-only` import so client components can call resolveTemplate
// directly with the context object the server prepared.

export type TemplateCategory =
  | 'greeting' | 'checkin' | 'checkout' | 'policy' | 'upsell'
  | 'escalation' | 'inquiry' | 'general';

export type TemplateLanguage = 'en' | 'ar' | 'auto';

export type Template = {
  id: string;
  name: string;
  channel: string[];          // empty = any
  source_filter: string[];    // empty = any
  language: TemplateLanguage;
  category: TemplateCategory;
  body: string;
  sort_order: number;
  active: boolean;
};

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  greeting: 'Greeting',
  checkin: 'Check-in',
  checkout: 'Checkout',
  policy: 'Policy',
  upsell: 'Upsell',
  escalation: 'Escalation',
  inquiry: 'Inquiry',
  general: 'General',
};

export const CATEGORY_ORDER: TemplateCategory[] = [
  'greeting', 'checkin', 'checkout', 'inquiry', 'upsell', 'escalation', 'policy', 'general',
];

// Variables locked in workflow Q5.
export type TemplateContext = {
  guest_name?: string | null;
  guest_first_name?: string | null;
  listing_nickname?: string | null;
  check_in_date?: string | null;     // pre-formatted "Apr 12" or YYYY-MM-DD
  check_out_date?: string | null;
  nights?: number | null;
  guests?: number | null;
  building_code?: string | null;
  wifi_ssid?: string | null;
  wifi_password?: string | null;
  checkin_time?: string | null;
  agent_name?: string | null;
  today_date?: string | null;
  address?: string | null;
};

const KNOWN_VARS = [
  'guest_name', 'guest_first_name', 'listing_nickname',
  'check_in_date', 'check_out_date', 'nights', 'guests', 'building_code',
  'wifi_ssid', 'wifi_password', 'checkin_time', 'agent_name', 'today_date', 'address',
] as const;

export type TemplateResolveResult = {
  resolved: string;          // body with all known vars substituted
  unresolved: string[];      // vars left as {key} because value was missing
};

const VAR_RE = /\{(\w+)\}/g;

// Replace every {var} that has a non-empty value in ctx; record the
// rest in unresolved. Caller blocks send-button if unresolved.length > 0.
export function resolveTemplate(body: string, ctx: TemplateContext): TemplateResolveResult {
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const resolved = body.replace(VAR_RE, (full, key: string) => {
    if (!(KNOWN_VARS as readonly string[]).includes(key)) {
      // Unknown variable — leave it untouched, flag it.
      if (!seen.has(key)) { seen.add(key); unresolved.push(key); }
      return full;
    }
    const v = ctx[key as keyof TemplateContext];
    if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
      if (!seen.has(key)) { seen.add(key); unresolved.push(key); }
      return full;
    }
    return String(v);
  });
  return { resolved, unresolved };
}

// Filter templates that apply to this conversation: channel match (or
// empty channel array) + source filter match (or empty).
export function templatesForConversation(
  all: Template[],
  channel: string,
  source: string | null,
): Template[] {
  const src = (source || '').toLowerCase();
  return all
    .filter(t => t.active)
    .filter(t => t.channel.length === 0 || t.channel.includes(channel))
    .filter(t => {
      if (t.source_filter.length === 0) return true;
      return t.source_filter.some(s => src.includes(s.toLowerCase()));
    })
    .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
}

// Build the context the resolver needs from the thread bundle data.
// Extracts the first word as guest_first_name when full_name has multiple
// words (best-effort; admin can edit before send).
export function buildContextFromHeader(header: {
  guest_full_name: string | null;
  listing_nickname: string | null;
  building_code: string | null;
}, opts: {
  reservation?: {
    check_in_date?: string | null;
    check_out_date?: string | null;
    nights?: number | null;
    guests?: number | null;
  } | null;
  secrets?: {
    wifi_ssid?: string | null;
    wifi_password?: string | null;
    checkin_time?: string | null;
  } | null;
  agentName?: string | null;
  address?: string | null;
}): TemplateContext {
  const fullName = header.guest_full_name || '';
  const firstName = fullName.split(/\s+/)[0] || null;
  return {
    guest_name: fullName || null,
    guest_first_name: firstName,
    listing_nickname: header.listing_nickname,
    building_code: header.building_code,
    check_in_date: opts.reservation?.check_in_date || null,
    check_out_date: opts.reservation?.check_out_date || null,
    nights: opts.reservation?.nights ?? null,
    guests: opts.reservation?.guests ?? null,
    wifi_ssid: opts.secrets?.wifi_ssid || null,
    wifi_password: opts.secrets?.wifi_password || null,
    checkin_time: opts.secrets?.checkin_time || null,
    agent_name: opts.agentName || null,
    today_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    address: opts.address || null,
  };
}
