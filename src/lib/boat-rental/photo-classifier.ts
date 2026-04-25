import 'server-only';
import { anthropic, HAIKU } from '@/lib/anthropic';
import { PHOTO_CATEGORIES, type PhotoCategory } from './photo-categories';

// Boat photo classifier — uses Claude Haiku 4.5 vision (~$0.001/image)
// to bucket each uploaded photo into one of five marketing-priority
// categories. Returns null on any failure so the caller can store the
// row with a null category and let the admin re-tag later via the
// per-boat backfill button.
//
// Called from the upload-attach API route (boat-image/attach) after the
// row is inserted, and from the backfillBoatPhotosClassificationAction
// server action that loops over untagged photos.
//
// Constants + the PhotoCategory type live in photo-categories.ts (not
// 'server-only') so client components can use them.

const SYSTEM_PROMPT = `You classify boat photos for a yacht-rental catalogue. Look at the image and pick exactly one category from this list:

- full_boat — exterior shot showing the whole boat or most of it (often from the dock or from above)
- seating — sundecks, lounges, sun pads, seating areas (front, back, or upper deck)
- interior — cabin, kitchen/galley, indoor lounge, bedroom (anything inside the boat that isn't a bathroom)
- bathroom — toilet, shower, sink, head
- other — engines, dock, accessories, close-ups of cushions or fittings, anything that doesn't fit the above

Respond with ONLY the category code (e.g. "full_boat"), nothing else.`;

async function imageUrlToInlineData(
  imageUrl: string
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/jpeg';
    // Anthropic vision wants the bare media type, not full content-type.
    const mediaType = ct.split(';')[0].trim();
    return { data: buf.toString('base64'), mediaType };
  } catch {
    return null;
  }
}

export async function classifyBoatPhoto(
  imageUrl: string
): Promise<PhotoCategory | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const inline = await imageUrlToInlineData(imageUrl);
  if (!inline) return null;

  let raw = '';
  try {
    const resp = await anthropic().messages.create({
      model: HAIKU,
      max_tokens: 16,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: inline.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: inline.data,
              },
            },
            { type: 'text', text: 'Classify this boat photo.' },
          ],
        },
      ],
    });
    const block = resp.content.find(b => b.type === 'text');
    raw = block && block.type === 'text' ? block.text.trim().toLowerCase() : '';
  } catch {
    return null;
  }

  // Match the first token to one of our codes — robust to extra
  // punctuation or quoting that the model might emit.
  for (const code of PHOTO_CATEGORIES) {
    if (raw.includes(code)) return code;
  }
  return null;
}
