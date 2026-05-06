import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';

interface Ctx { params: Promise<{ token: string }> }

type Lang = 'en' | 'ar' | 'ru' | 'fr';
const VALID_LANGS: Lang[] = ['en', 'ar', 'ru', 'fr'];

export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) {
    return NextResponse.json(
      { error: c.reason },
      { status: c.reason === 'token_not_found' ? 404 : 403 },
    );
  }

  const url = new URL(req.url);
  const langParam = url.searchParams.get('lang');
  const lang: Lang = (VALID_LANGS as string[]).includes(langParam ?? '')
    ? (langParam as Lang)
    : c.guest_language;

  const sb = supabaseAdmin();
  const [cats, items, mods, overrides] = await Promise.all([
    sb.from('fnb_categories')
      .select('*').eq('enabled', true).order('sort_order'),
    sb.from('fnb_items')
      .select('*').eq('enabled', true).is('deleted_at', null).order('sort_order'),
    sb.from('fnb_item_modifiers')
      .select('*').eq('enabled', true).order('sort_order'),
    sb.from('fnb_building_overrides')
      .select('item_id').eq('building_code', c.building_code).eq('is_out_of_stock', true),
  ]);

  if (cats.error || items.error || mods.error || overrides.error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const outOfStock = new Set((overrides.data ?? []).map(o => o.item_id));

  function localize<T extends Record<string, unknown>>(row: T, fields: string[]): T {
    const out = { ...row };
    for (const f of fields) {
      (out as Record<string, unknown>)[f] = (row[`${f}_${lang}`] as string | null)
        ?? (row[`${f}_en`] as string | null)
        ?? null;
    }
    return out as T;
  }

  return NextResponse.json({
    context: {
      token,
      building_code: c.building_code,
      unit_code: c.unit_code,
      guest_name: c.guest_name,
      guest_language: lang,
    },
    categories: (cats.data ?? []).map(cat =>
      localize(cat, ['name'])),
    items: (items.data ?? []).map(item => ({
      ...localize(item, ['name', 'description']),
      out_of_stock: outOfStock.has(item.id),
    })),
    modifiers: (mods.data ?? []).map(m => localize(m, ['name'])),
  });
}
