import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// AI-suggested SKU rename for items where the Amazon listing's product
// differs in name / size / brand from the SKU's existing code. Operator
// pastes Amazon URL → sourcer fetches → applies Amazon details
// (name + brand) → if size or brand changed, the SKU code itself is now
// misleading (e.g. CLN-ANTIFLY-400ML when actual product is 300 ML).
//
// This module asks Claude Haiku 4.5 to suggest a new SKU that follows
// the existing catalog's naming conventions:
//   • <CATEGORY-PREFIX>-<KEY-WORD>-<SIZE>
//   • CLN- for chemicals, SAN- for sanitary, TRAY- for fnb/welcome,
//     LIN- for linen, BRN- for branded, MNT- for maintenance, WTR- for
//     welcome tray.
//   • KEY-WORD is the most distinctive product noun, uppercased.
//   • SIZE is the smallest pack/volume unit, uppercased and abbreviated
//     (300ML, 1L, 4PK, 30G, etc.).
//
// Returns null on any error so the caller can degrade gracefully —
// auto-rename is a quality-of-life feature, not a blocker.

const MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export type SkuRenameInput = {
  oldSku: string;
  categoryCode: string;       // e.g. 'chemicals', 'sanitary', 'fnb'
  oldNameEn: string;
  newNameEn: string;          // from Amazon (canonical)
  newBrand: string | null;
  uom: string;
  packSize: number | null;    // amazon_eg_pack_size — count of UoM units in one pack (1 = single, 4 = pack of 4)
  /**
   * M.16 — Amazon-fetched pack volume (e.g. 4 + 'kg', 300 + 'ml').
   * The KEY signal for the AI to encode in the SKU's SIZE suffix —
   * without this, the AI inherits the OLD SKU's stale size suffix.
   */
  amazonPackVolumeValue?: number | null;
  amazonPackVolumeUom?: string | null;
};

const SYSTEM = `You generate inventory SKU codes for Beit Hady, a serviced-apartment business in Egypt. Output strict JSON only — no preamble, no code fence.`;

function buildPrompt(input: SkuRenameInput): string {
  const PREFIX_BY_CATEGORY: Record<string, string> = {
    chemicals: 'CLN',
    sanitary: 'SAN',
    fnb: 'TRAY',
    welcome_tray: 'WTR',
    linen: 'LIN',
    consumables: 'LIN',
    branded: 'BRN',
    maintenance: 'MNT',
    assets: 'AST',
  };
  const expectedPrefix = PREFIX_BY_CATEGORY[input.categoryCode] || 'GEN';

  return `Suggest a new SKU code for this item. Existing catalog uses the format:

  <CATEGORY-PREFIX>-<KEY-WORD>-<SIZE>

Examples from the catalog:
  CLN-ANTIFLY-400ML, CLN-BLEACH-1L, CLN-PLEDGE-300ML, CLN-DISH-LIQ-1L,
  SAN-SHAMPOO-30ML, SAN-CONDITIONER-30ML, SAN-DENTAL-KIT, SAN-COMB,
  TRAY-WATER-500ML, TRAY-COFFEE-SACHET, TRAY-TEABAG, TRAY-COOKIES-PACK,
  LIN-TRASH-KITCHEN, LIN-SLIPPERS, LIN-TOWEL-BATH, LIN-PILLOWCASE-WHITE,
  BRN-WELCOME-CARD, BRN-PEN, BRN-WIFI-CARD,
  MNT-LIGHTBULB-LED-9W, MNT-AC-FILTER, MNT-SCREW-PACK,
  WTR-FRUIT-BOWL, WTR-TRAY.

Rules:
- Prefix MUST be "${expectedPrefix}" (matches the item's category code "${input.categoryCode}").
- KEY-WORD: 1–2 segments, uppercase, hyphen-separated. Pick the most distinctive product noun(s). Brand names are OK if they're how the operator would reference the item (e.g. PLEDGE, RAID).
- SIZE: encode the smallest pack/volume unit using these abbreviations: ML for milliliters, L for litres, G for grams, KG for kilograms, PK for "pack of N", or omit entirely for items where size is irrelevant (e.g. comb, sewing kit). Examples: 300ML, 1L, 4L, 12PK, 50G.
- Total length: ≤ 30 characters. Use only A-Z, 0-9, hyphen.
- Avoid generic words like PRODUCT, ITEM, NEW, AMAZON.

Item:
- Old SKU: ${input.oldSku}   ← IGNORE the size suffix at the end of this. It's stale; you MUST use the new pack volume below.
- Category: ${input.categoryCode}
- Old name: ${input.oldNameEn}
- New name (from Amazon): ${input.newNameEn}
- Brand: ${input.newBrand || '—'}
- UoM (purchasable unit): ${input.uom}
- Pack count (units per pack): ${input.packSize ?? 1}
- ACTUAL PACK VOLUME (use this for the SIZE suffix): ${
    input.amazonPackVolumeValue && input.amazonPackVolumeUom
      ? `${input.amazonPackVolumeValue} ${input.amazonPackVolumeUom}  ← encode as ${formatSizeToken(input.amazonPackVolumeValue, input.amazonPackVolumeUom)}`
      : '(unknown — fall back to extracting from the new name, or omit SIZE entirely)'
  }

Output:
{
  "sku": "the suggested new SKU code, all-caps, hyphen-separated",
  "rationale": "one sentence explaining why this SKU"
}`;
}

const SKU_PATTERN = /^[A-Z][A-Z0-9-]{1,29}$/;

/**
 * Normalize a numeric pack-volume + UoM into the SKU SIZE suffix format
 * the catalog uses (300ML, 1L, 4KG, 50G, 12PK). Strips trailing .0 and
 * uppercases the unit.
 */
function formatSizeToken(value: number, uom: string): string {
  const cleanNum = String(value).replace(/\.0+$/, '');
  const upperUom = uom.toUpperCase();
  return `${cleanNum}${upperUom}`;
}

export async function suggestSkuRename(
  input: SkuRenameInput,
): Promise<{ ok: true; sku: string; rationale: string } | { ok: false; error: string }> {
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.1,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });
    const textBlocks: string[] = [];
    for (const block of res.content) if (block.type === 'text') textBlocks.push(block.text);
    if (textBlocks.length === 0) return { ok: false, error: 'Claude returned no text' };

    const raw = textBlocks.join('\n').trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return { ok: false, error: 'No JSON object in Claude response' };
      try { parsed = JSON.parse(m[0]); } catch { return { ok: false, error: 'Could not parse JSON' }; }
    }
    const obj = parsed as { sku?: unknown; rationale?: unknown };
    const sku = typeof obj.sku === 'string' ? obj.sku.trim().toUpperCase() : '';
    const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim().slice(0, 200) : '';
    if (!SKU_PATTERN.test(sku)) {
      return { ok: false, error: `Suggested SKU "${sku}" doesn't match SKU pattern` };
    }
    return { ok: true, sku, rationale: rationale || 'No rationale returned' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'AI suggest failed' };
  }
}
