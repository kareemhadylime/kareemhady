import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

// M.13 — WhatsApp inbound reorder parser. Reuses the Phase E classifier
// pattern (haiku-4-5 + structured JSON) to detect reorder-style messages
// from cleaners and create draft Issues for manager approval.
//
// Trigger heuristics (run BEFORE calling Claude — saves cost):
//   * Arabic keywords: نقص / خلص / محتاج / مطلوب / لازم / ينتهي
//   * English keywords: ran out / running low / need / out of / restock
//   * Hashtag: #reorder
// Only messages matching at least one heuristic get sent to Claude.

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'v1';

const TRIGGER_PATTERNS = [
  /#reorder\b/i,
  /\b(ran out|running low|need|out of|restock|order|low on)\b/i,
  /(نقص|خلص|محتاج|مطلوب|لازم|ينتهي|انتهى|اطلب|اطلبوا)/,
];

export function looksLikeReorder(body: string): boolean {
  if (!body || body.length < 4) return false;
  return TRIGGER_PATTERNS.some(re => re.test(body));
}

// Identify the building referenced in the message (e.g. "BH-26", or
// Arabic equivalents like "بيت 26"). Returns null if ambiguous.
const BUILDING_PATTERNS: Array<{ code: string; patterns: RegExp[] }> = [
  { code: 'BH-26',  patterns: [/\bbh-?26\b/i, /\b٢٦\b/, /بيت\s*26/, /بيت\s*٢٦/] },
  { code: 'BH-73',  patterns: [/\bbh-?73\b/i, /\b٧٣\b/, /بيت\s*73/, /بيت\s*٧٣/] },
  { code: 'BH-435', patterns: [/\bbh-?435\b/i, /\b٤٣٥\b/, /بيت\s*435/, /بيت\s*٤٣٥/] },
  { code: 'BH-OK',  patterns: [/\bbh-?ok\b/i, /\boktober\b/i, /اوكتوبر/, /أكتوبر/] },
  { code: 'BH-34',  patterns: [/\bbh-?34\b/i, /\b٣٤\b/, /بيت\s*34/, /بيت\s*٣٤/] },
];

export function detectBuilding(body: string): string | null {
  for (const b of BUILDING_PATTERNS) {
    if (b.patterns.some(re => re.test(body))) return b.code;
  }
  return null;
}

export type ParsedReorderItem = {
  raw_name: string;
  qty: number | null;
  matched_item_id: string | null;
  matched_item_sku: string | null;
  matched_item_name: string | null;
  match_confidence: 'exact' | 'fuzzy' | 'none';
};

export type ReorderParse = {
  building_code: string | null;
  items: ParsedReorderItem[];
  warnings: string[];
};

export async function parseReorderMessage(body: string): Promise<ReorderParse> {
  const buildingFromText = detectBuilding(body);

  // Pull the catalog (active items) so Claude can match against real SKUs
  const sb = supabaseAdmin();
  const { data: catalog } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, name_en, name_ar, uom')
    .eq('active', true)
    .limit(500);
  type Item = { id: string; sku: string; name_en: string; name_ar: string; uom: string };
  const items = (catalog as Item[] | null) || [];

  if (items.length === 0) {
    return { building_code: buildingFromText, items: [], warnings: ['No active items in catalog'] };
  }

  // Build a compact catalog list for the prompt
  const catalogStr = items
    .slice(0, 200)
    .map(it => `${it.sku} | ${it.name_en} | ${it.name_ar} (${it.uom})`)
    .join('\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { building_code: buildingFromText, items: [], warnings: ['Anthropic API key not configured'] };
  }

  const client = new Anthropic({ apiKey });

  let raw: { items: Array<{ name: string; qty?: number | null; matched_sku?: string | null }> } | null = null;
  try {
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      temperature: 0,
      system: `You parse WhatsApp messages from housekeepers about inventory items they need to reorder.

CATALOG (sku | english name | arabic name (uom)):
${catalogStr}

Return STRICT JSON shape: {"items":[{"name":"<as said>","qty":<number or null>,"matched_sku":"<exact SKU from catalog or null>"}]}
- Match the requested item to the closest catalog SKU (exact match preferred). Set null if no plausible match.
- Extract qty if explicitly stated ("3 packs", "علبتين"), else null.
- DO NOT invent items not mentioned. DO NOT include English/Arabic translations of the same item separately.
- If the message is not actually an inventory request, return {"items":[]}.
- Output JSON only — no commentary.`,
      messages: [{ role: 'user', content: body }],
    });
    const text = completion.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (match) raw = JSON.parse(match[0]);
  } catch (e) {
    return {
      building_code: buildingFromText,
      items: [],
      warnings: [`AI parse failed: ${e instanceof Error ? e.message : 'unknown'}`],
    };
  }

  if (!raw || !Array.isArray(raw.items)) {
    return { building_code: buildingFromText, items: [], warnings: ['AI returned no items'] };
  }

  const itemBySku = new Map(items.map(it => [it.sku, it]));
  const parsedItems: ParsedReorderItem[] = raw.items.map(r => {
    const matched = r.matched_sku ? itemBySku.get(r.matched_sku) : null;
    return {
      raw_name: r.name,
      qty: r.qty ?? null,
      matched_item_id: matched?.id || null,
      matched_item_sku: matched?.sku || null,
      matched_item_name: matched?.name_en || null,
      match_confidence: matched ? (r.matched_sku === matched.sku ? 'exact' : 'fuzzy') : 'none',
    };
  });

  const warnings: string[] = [];
  if (!buildingFromText) warnings.push('No building identifier found — defaulting to OTHER warehouse');
  const unmatched = parsedItems.filter(i => i.match_confidence === 'none').length;
  if (unmatched > 0) warnings.push(`${unmatched} item${unmatched === 1 ? '' : 's'} not matched in catalog`);

  return {
    building_code: buildingFromText,
    items: parsedItems,
    warnings,
  };
}

// Process a parsed reorder into a draft Issue. Hooked from the wa-casual
// ingest pipeline. Always status='submitted' (manager must approve).
export async function createReorderDraftFromWa(opts: {
  parsed: ReorderParse;
  sender_phone: string;
  sender_name: string | null;
  conversation_id: string;
  message_id: string;
  raw_body: string;
}): Promise<{ ok: boolean; issue_id?: string; issue_no?: string; reason?: string }> {
  const { parsed, sender_phone, sender_name, conversation_id, message_id, raw_body } = opts;

  // Need at least one matched item
  const matched = parsed.items.filter(i => i.matched_item_id);
  if (matched.length === 0) {
    return { ok: false, reason: 'no_matched_items' };
  }

  const sb = supabaseAdmin();

  // Resolve the warehouse: main warehouse for detected building, else OTHER
  const buildingCode = parsed.building_code || 'OTHER';
  const { data: wh } = await sb
    .from('beithady_inventory_warehouses')
    .select('id, code, building_code')
    .eq('building_code', buildingCode)
    .is('parent_id', null)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  const warehouse = wh as { id: string; code: string; building_code: string } | null;
  if (!warehouse) {
    return { ok: false, reason: 'warehouse_not_found' };
  }

  // Use the next-issue-no helper inline (avoid top-level import cycle)
  const year = new Date().getFullYear();
  const { data: lastNo } = await sb
    .from('beithady_inventory_issues')
    .select('issue_no')
    .ilike('issue_no', `ISS-${year}-%`)
    .order('issue_no', { ascending: false })
    .limit(1);
  const nextSeq = lastNo && lastNo.length > 0
    ? parseInt(((lastNo[0] as { issue_no: string }).issue_no).split('-')[2] || '0', 10) + 1
    : 1;
  const issue_no = `ISS-${year}-${String(nextSeq).padStart(4, '0')}`;

  const cleanerLabel = sender_name
    ? `WA · ${sender_name} (${sender_phone})`
    : `WA · ${sender_phone}`;

  const { data: header, error: hErr } = await sb
    .from('beithady_inventory_issues')
    .insert({
      issue_no,
      status: 'submitted',
      type: 'per_reservation',
      warehouse_id: warehouse.id,
      notes: `Inbound WA reorder request from ${cleanerLabel}\n\nOriginal message: "${raw_body.slice(0, 500)}"`,
      created_by_user: `wa_inbound:${sender_phone}`,
      created_via: 'wa_inbound',
      cleaner_session_name: cleanerLabel,
    })
    .select('id, issue_no')
    .single();

  if (hErr || !header) return { ok: false, reason: hErr?.message || 'insert_failed' };

  // Insert lines for matched items
  const linesToInsert = matched.map((m, i) => ({
    issue_id: header.id,
    line_no: i + 1,
    item_id: m.matched_item_id,
    qty: m.qty || 1,
    batch_no_picked: '__bulk__',
    note: m.match_confidence === 'fuzzy'
      ? `WA raw: "${m.raw_name}" → fuzzy match`
      : `WA raw: "${m.raw_name}"`,
  }));
  const { error: lErr } = await sb.from('beithady_inventory_issue_lines').insert(linesToInsert);
  if (lErr) {
    await sb.from('beithady_inventory_issues').delete().eq('id', header.id);
    return { ok: false, reason: lErr.message };
  }

  await recordAudit({
    actor_user_id: null,
    module: 'inventory',
    action: 'wa_inbound.reorder_draft',
    target_type: 'issue',
    target_id: header.id,
    metadata: {
      sender_phone,
      conversation_id,
      message_id,
      building_code: buildingCode,
      items_matched: matched.length,
      warnings: parsed.warnings,
      ai_model: MODEL,
      prompt_version: PROMPT_VERSION,
    },
  });

  return { ok: true, issue_id: header.id, issue_no: header.issue_no };
}
