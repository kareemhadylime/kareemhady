import 'server-only';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { BrandShell } from './_components/brand-shell';
import { CategorySection } from './_components/category-section';
import { CartBar } from './_components/cart-bar';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

export default async function DinePage({ params }: Ctx) {
  const { token } = await params;
  const c = await validateDineToken(token);

  if (!c.ok) {
    return (
      <BrandShell guestName={null} buildingCode={null} unitCode={null} lang="en">
        <div className="text-center py-16 px-6">
          <h2 className="display text-3xl mb-4">Service unavailable</h2>
          <p className="text-sm" style={{ color: 'var(--bh-ink-muted)' }}>
            {c.reason === 'reservation_not_checked_in'
              ? 'Available once you check in.'
              : c.reason === 'building_disabled' || c.reason === 'building_not_egypt'
                ? 'In-room dining is not available at this property.'
                : 'Please contact reception by dialling 0 from your living room.'}
          </p>
        </div>
      </BrandShell>
    );
  }

  const sb = supabaseAdmin();
  const [cats, items, mods, overrides] = await Promise.all([
    sb.from('fnb_categories').select('*')
      .eq('enabled', true).order('sort_order'),
    sb.from('fnb_items').select('*')
      .eq('enabled', true).is('deleted_at', null).order('sort_order'),
    sb.from('fnb_item_modifiers').select('*')
      .eq('enabled', true).order('sort_order'),
    sb.from('fnb_building_overrides').select('item_id')
      .eq('building_code', c.building_code).eq('is_out_of_stock', true),
  ]);

  const outOfStock = new Set((overrides.data ?? []).map(o => o.item_id));

  return (
    <BrandShell
      guestName={c.guest_name}
      buildingCode={c.building_code}
      unitCode={c.unit_code}
      lang={c.guest_language}
    >
      {(cats.data ?? []).map(cat => {
        const catItems = (items.data ?? []).filter(i => i.category_id === cat.id);
        return (
          <CategorySection
            key={cat.id}
            category={cat}
            items={catItems}
            modifiers={(mods.data ?? []).filter(m =>
              catItems.some(i => i.id === m.item_id))}
            outOfStock={outOfStock}
          />
        );
      })}
      <p className="dine-fineprint">
        All prices are inclusive of 14% VAT &amp; 12% Service Charge
      </p>
      <CartBar token={token} />
    </BrandShell>
  );
}
