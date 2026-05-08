import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { translateMenuField } from '@/lib/beithady/fnb/translate';
import { getItem, updateModifier } from '@/lib/beithady/fnb/repo';
import { supabaseAdmin } from '@/lib/supabase';
import { ModifierSchema } from '@/lib/beithady/fnb/types';

const Body = z.object({ target_lang: z.enum(['ar', 'ru', 'fr']) });

interface Ctx { params: Promise<{ id: string; modId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id, modId } = await ctx.params;
  const parsedResult = Body.safeParse(await req.json());
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const { target_lang } = parsedResult.data;

  // Verify the modifier belongs to the item specified in the URL
  const sb = supabaseAdmin();
  const { data: mod, error } = await sb
    .from('fnb_item_modifiers')
    .select('*')
    .eq('id', modId)
    .eq('item_id', id)
    .single();
  if (error || !mod) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const m = ModifierSchema.parse(mod);

  const { translation } = await translateMenuField({
    text: m.name_en,
    field: 'modifier_name',
    target_lang,
  });

  const newFlags = { ...(m.ai_translation_flags ?? {}), [`name_${target_lang}`]: true };

  const updated = await updateModifier(
    modId,
    {
      [`name_${target_lang}`]: translation,
      ai_translation_flags: newFlags,
    } as never,
    { actor_user_id: user.id },
  );

  return NextResponse.json({ modifier: updated });
}
