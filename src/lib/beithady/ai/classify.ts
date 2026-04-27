import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// Inbound-message classifier + suggested reply generator. One Claude
// haiku-4-5 call returns structured JSON the gate/orchestrator can
// consume. Keeps cost ~$0.001/message and latency <2s.
//
// Categories cover the bulk of guest-relations FAQs we saw in the
// 1,011 guesty_conversation_posts during Phase C ingest. Anything
// outside this taxonomy → small_talk (won't auto-send).

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'v1';

export const CLASSIFICATIONS = [
  'inquiry',          // pre-booking question (price, availability, photos)
  'check_in',         // check-in time, late arrival, key handoff
  'check_out',        // check-out time, late checkout
  'wifi',             // wifi password / connectivity
  'amenities',        // pool, gym, parking, A/C, kitchen
  'directions',       // address / how to get there
  'house_rules',      // smoking, noise, pets, parties
  'cleaning',         // mid-stay clean, fresh towels
  'maintenance',      // broken X, A/C not working, plumbing
  'complaint',        // unhappy / dispute / threatening review (always agent)
  'refund',           // money back request (always agent)
  'urgent',           // safety, lockout, medical (always agent)
  'thanks',           // thank you / positive sentiment
  'review_ask',       // "leave a review" reminder responses
  'small_talk',       // chitchat, no actionable content
  'other',            // catch-all — agent reviews
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

// Categories that we NEVER auto-send on, even with high confidence —
// the gate enforces this so the prompt can be lenient.
export const HIGH_RISK_CLASSIFICATIONS = new Set<Classification>([
  'complaint', 'refund', 'urgent', 'maintenance', 'other',
]);

export type ClassifyInput = {
  inboundBody: string;                 // the guest's actual message
  channel: 'guesty' | 'wa_cloud' | 'wa_casual';
  guestName?: string | null;
  guestCountry?: string | null;
  guestLanguage?: string | null;
  vip?: boolean;
  loyaltyTier?: string | null;
  reservation?: {
    listing_nickname?: string | null;
    building_code?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    nights?: number | null;
    source?: string | null;
  } | null;
  // Last 5 messages of the same conversation, oldest→newest, for context
  recentThread?: Array<{ direction: 'inbound' | 'outbound'; body: string; sent_at: string }>;
};

export type ClassifyResult = {
  classification: Classification;
  confidence: number;            // 0-1
  language_detected: string;     // ISO 639-1 (en, ar, ru, de, ...)
  suggested_reply: string;       // generated in the same language
  reasoning: string;             // 1-sentence why
  prompt_version: string;
  model: string;
  raw: unknown;
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

export async function classifyAndDraft(input: ClassifyInput): Promise<ClassifyResult> {
  const client = getClient();
  const system = buildSystem();
  const user = buildUserPrompt(input);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 0.4,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  // Parse JSON body — Claude follows the schema reliably with a strict prompt
  const parsed = parseJsonish(text);
  return {
    classification: normalizeClassification(parsed?.classification),
    confidence: clampConfidence(parsed?.confidence),
    language_detected: typeof parsed?.language === 'string' ? parsed.language : 'en',
    suggested_reply: typeof parsed?.suggested_reply === 'string' ? parsed.suggested_reply : '',
    reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning : '',
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    raw: { full: text, parsed },
  };
}

// ---- prompt construction ----

function buildSystem(): string {
  return `You are the AI co-pilot for guest relations at Beit Hady, a serviced-apartment business with 91 units across 5 buildings in Egypt + Dubai (BH-26, BH-73, BH-435, BH-OK, BH-34). You receive an inbound guest message and must:

1. CLASSIFY it into exactly one category from this taxonomy:
   inquiry, check_in, check_out, wifi, amenities, directions, house_rules, cleaning, maintenance, complaint, refund, urgent, thanks, review_ask, small_talk, other
2. ASSIGN a confidence between 0 and 1 reflecting how sure you are about the classification AND how appropriate it would be to auto-send your draft. Be conservative: any ambiguity → < 0.85.
3. DETECT the guest's language (ISO 639-1: en, ar, ru, de, fr, it, pl, cs, es, tr, ...). Reply in the SAME language.
4. DRAFT a 1-3 sentence reply in the guest's language. Tone: warm, professional, hospitality-grade. No emojis unless the guest used them. No greeting unless the guest greeted first. Sign off as the property team if the channel is email; otherwise no signature.
5. Provide a 1-sentence REASONING for the classification.

Output STRICTLY valid JSON, no markdown fences, no commentary. Schema:
{ "classification": "<category>", "confidence": 0.00-1.00, "language": "<iso>", "suggested_reply": "<text>", "reasoning": "<text>" }

Hard rules — confidence MUST be ≤ 0.7 if any of these hold:
- The message contains a complaint, threat, refund request, or safety emergency
- You'd need information you don't have (specific reservation dates, prices, exact unit availability)
- The message is in a language you can't reply fluently in
- The intent is unclear or could be multiple categories
- The conversation has prior unresolved complaints

Hard rules — never invent prices, dates, unit numbers, or specific availability. Use generic placeholders or defer to "the team will check and confirm shortly" if specifics are needed.

For check_in / check_out / wifi / amenities / directions / house_rules / thanks / review_ask, you may answer with confidence ≥ 0.85 ONLY if the answer is generic and doesn't depend on this specific reservation.`;
}

function buildUserPrompt(input: ClassifyInput): string {
  const ctx = [
    `Channel: ${input.channel}`,
    input.guestName ? `Guest: ${input.guestName}` : null,
    input.guestCountry ? `Guest country: ${input.guestCountry}` : null,
    input.guestLanguage ? `Preferred language: ${input.guestLanguage}` : null,
    input.vip ? 'VIP: yes' : null,
    input.loyaltyTier && input.loyaltyTier !== 'none' ? `Loyalty tier: ${input.loyaltyTier}` : null,
    input.reservation?.listing_nickname ? `Listing: ${input.reservation.listing_nickname}` : null,
    input.reservation?.building_code ? `Building: ${input.reservation.building_code}` : null,
    input.reservation?.check_in ? `Check-in: ${input.reservation.check_in}` : null,
    input.reservation?.check_out ? `Check-out: ${input.reservation.check_out}` : null,
    input.reservation?.source ? `Source: ${input.reservation.source}` : null,
  ].filter(Boolean).join(' · ');

  let recent = '';
  if (input.recentThread && input.recentThread.length > 0) {
    const lines = input.recentThread.map(m => `[${m.direction === 'inbound' ? 'GUEST' : 'US'}] ${m.body.slice(0, 300)}`).join('\n');
    recent = `\n\nRecent conversation (oldest first):\n${lines}\n`;
  }

  return `Context: ${ctx || '(no metadata)'}${recent}

Inbound message from guest:
"""
${input.inboundBody.slice(0, 2000)}
"""

Respond with JSON only.`;
}

// ---- response parsing ----

function parseJsonish(text: string): Record<string, unknown> | null {
  if (!text) return null;
  // Try direct parse first
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fallthrough */ }
  }
  // Extract first {...} block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* fallthrough */ }
  }
  return null;
}

function normalizeClassification(v: unknown): Classification {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : 'other';
  return (CLASSIFICATIONS as readonly string[]).includes(s) ? (s as Classification) : 'other';
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
