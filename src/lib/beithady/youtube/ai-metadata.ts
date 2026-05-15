// src/lib/beithady/youtube/ai-metadata.ts
import Anthropic from '@anthropic-ai/sdk';
import { findTemplate } from './templates';

const BOOKING_URL = 'https://beithady.com';

export type GeneratedMetadata = {
  title: string;
  description: string;
  tags: string[];
  language: string;
  variables_filled: Record<string, string>;
  cost_usd: number;
};

export function parseAiJson(raw: string): Record<string, unknown> | null {
  // Strip ```json fence or plain ``` fence
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1] : raw;
  // Find the first {...} object (greedy)
  const match = body.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export function clampTitle(input: string, max: number): string {
  return input.length <= max ? input : input.slice(0, max);
}

export function clampDescription(input: string, max: number): string {
  return input.length <= max ? input : input.slice(0, max);
}

export function clampTags(input: string[], totalMaxChars: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let total = 0;
  for (const raw of input) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (total + tag.length > totalMaxChars) break;
    seen.add(key);
    out.push(tag);
    total += tag.length;
  }
  return out;
}

export function substituteBookingUrl(input: string): string {
  return input.replace(/\{booking_url\}/g, BOOKING_URL);
}

export type GenerateInput = {
  template_id: string;
  building_code?: string;
  is_shorts: boolean;
  user_brief?: string;
  midpoint_frame_dataurl: string;        // 'data:image/jpeg;base64,...'
};

export async function generateYouTubeMetadata(input: GenerateInput): Promise<GeneratedMetadata> {
  const tmpl = findTemplate(input.template_id);
  if (!tmpl) throw new Error(`unknown template: ${input.template_id}`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are generating YouTube metadata for a Beit Hady hospitality video.

Template: "${tmpl.label}"
Building: ${input.building_code ?? 'Generic'}
Format: ${input.is_shorts ? 'YouTube Shorts (vertical, <=60s)' : 'Long-form (16:9)'}
Operator brief (optional): "${input.user_brief ?? ''}"

Template scaffolding (do not deviate from structure; fill {variables}):
  TITLE:       ${tmpl.title_template}
  DESCRIPTION: ${tmpl.description_template}
  BASE TAGS:   ${tmpl.default_tags.join(', ')}

Return JSON ONLY with these fields, respecting YouTube limits:
- title (<=100 chars)
- description (<=2000 chars; include {booking_url} literally, our app substitutes)
- tags (array of 5-15 strings, each <=30 chars, total <=500 chars; INCLUDE the base tags)
- language ('en' or 'ar' based on visual cues; default 'en')
- variables_filled (key-value map of template variables you filled)

Rules:
- For Shorts, the description's first line must be "#Shorts".
- Be SPECIFIC about what's VISIBLE in the frame. Do NOT fabricate amenities you can't see.
- Tags must be SEO-friendly for hospitality / short-term rentals / Cairo.
- Match the description's language to the 'language' field.`;

  const base64 = input.midpoint_frame_dataurl.split(',')[1];

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const textBlock = resp.content.find(c => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('no_text_response');
  const parsed = parseAiJson(textBlock.text);
  if (!parsed) throw new Error('invalid_json_response');

  const title = clampTitle(String(parsed.title ?? ''), 100);
  const description = substituteBookingUrl(clampDescription(String(parsed.description ?? ''), 5000));
  const tags = clampTags(Array.isArray(parsed.tags) ? parsed.tags.map(String) : [], 500);
  const language = String(parsed.language ?? tmpl.default_language);
  const variables_filled = (parsed.variables_filled && typeof parsed.variables_filled === 'object')
    ? parsed.variables_filled as Record<string, string> : {};

  // Cost: claude-haiku-4-5 = $1/MTok input, $5/MTok output
  const inTok = resp.usage.input_tokens;
  const outTok = resp.usage.output_tokens;
  const cost_usd = (inTok / 1_000_000) * 1 + (outTok / 1_000_000) * 5;

  return { title, description, tags, language, variables_filled, cost_usd };
}
