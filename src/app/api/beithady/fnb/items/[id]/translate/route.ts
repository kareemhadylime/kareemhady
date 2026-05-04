import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { translateMenuField } from '@/lib/beithady/fnb/translate';
import { getItem, updateItem } from '@/lib/beithady/fnb/repo';

const Body = z.object({
  field: z.enum(['name', 'description']),
  target_lang: z.enum(['ar', 'ru', 'fr']),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const { field, target_lang } = Body.parse(await req.json());

  const item = await getItem(id);
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const sourceText = (field === 'name' ? item.name_en : item.description_en) ?? '';
  const { translation } = await translateMenuField({
    text: sourceText, field, target_lang,
  });

  // Patch the localized field + mark it as AI-drafted
  const flagsKey = `${field}_${target_lang}`;
  const newFlags = { ...(item.ai_translation_flags ?? {}), [flagsKey]: true };
  const patch = {
    [`${field}_${target_lang}`]: translation,
    ai_translation_flags: newFlags,
  } as Record<string, unknown>;

  const updated = await updateItem(id, patch as never, { actor_user_id: user.id });
  return NextResponse.json({ item: updated, translation });
}
