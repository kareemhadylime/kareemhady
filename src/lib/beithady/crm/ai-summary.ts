import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

// Per-guest AI summary using Claude haiku-4-5. Cheap (~$0.001/guest)
// and fast (~1s). Generated for top guests by recent activity in the
// daily sync, OR lazily on first profile open if missing/stale.
//
// Phase E-aware: this file uses the same Anthropic client pattern as
// the existing review-summarization in beithady-daily-report.

const MODEL = 'claude-haiku-4-5-20251001';
const STALE_DAYS = 14;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

export type GuestSummaryInput = {
  full_name: string | null;
  residence_country: string | null;
  language: string | null;
  lifetime_stays: number;
  lifetime_nights: number;
  loyalty_tier: string;
  vip: boolean;
  source_signals: { sources?: string[]; is_returning_per_guesty?: boolean };
  tags: string[];
  recent_events?: Array<{ type: string; title: string; at: string }>;
};

export async function generateGuestSummary(input: GuestSummaryInput): Promise<string> {
  const client = getClient();
  const prompt = buildPrompt(input);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 220,
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return text;
}

function buildPrompt(g: GuestSummaryInput): string {
  const recent = (g.recent_events || []).slice(0, 8);
  const recentLines = recent.length
    ? recent.map(e => `- ${e.type.toUpperCase()} ${e.at.slice(0, 10)} ${e.title}`).join('\n')
    : '(no recent events)';
  return `You are a hospitality CRM analyst writing a 2-3 sentence operational summary for the guest-relations team at Beit Hady, a serviced-apartment business in Egypt + Dubai. Write in plain English regardless of the guest's language. Focus on actionable signal: returning behavior, channel preference, complaint flags, upgrade opportunities.

Guest:
- Name: ${g.full_name || 'Unknown'}
- Country: ${g.residence_country || 'unknown'}
- Language: ${g.language || 'unknown'}
- Lifetime: ${g.lifetime_stays} stays / ${g.lifetime_nights} nights
- Loyalty tier: ${g.loyalty_tier}${g.vip ? ' · VIP' : ''}
- Tags: ${g.tags.join(', ') || '(none)'}
- Booking sources: ${(g.source_signals.sources || []).join(', ') || '(none)'}
- Returning per Guesty: ${g.source_signals.is_returning_per_guesty ? 'yes' : 'no'}

Recent activity:
${recentLines}

Write 2-3 sentences. No greeting, no signature.`;
}

export async function persistGuestSummary(guestId: string, summary: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from('beithady_guests')
    .update({
      ai_summary: summary,
      ai_summary_updated_at: new Date().toISOString(),
      ai_summary_model: MODEL,
    })
    .eq('id', guestId);
}

// Decide whether a guest's summary is stale. Used by the cron + the
// 360° page's lazy-fill path.
export function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > STALE_DAYS * 86400e3;
}
