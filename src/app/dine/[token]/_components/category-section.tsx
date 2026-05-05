import 'server-only';
import type { Category, Item, Modifier } from '@/lib/beithady/fnb/types';
import { ItemCard } from './item-card';
import { tr, type DineLang } from './i18n';

export function CategorySection({
  category,
  items,
  modifiers,
  outOfStock,
  lang,
}: {
  category: Category;
  items: Item[];
  modifiers: Modifier[];
  outOfStock: Set<string>;
  lang: DineLang;
}) {
  return (
    <section className="relative px-2">
      <h2 className="dine-section-title">{(category as unknown as { name?: string }).name ?? category.name_en}</h2>
      <div>
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            modifiers={modifiers.filter(m => m.item_id === item.id)}
            outOfStock={outOfStock.has(item.id!)}
            lang={lang}
          />
        ))}
      </div>
      <p className="dine-fineprint">
        {tr('available_daily', lang, {
          start: category.hours_start.slice(0, 5),
          end: category.hours_end.slice(0, 5),
        })}
      </p>
    </section>
  );
}
