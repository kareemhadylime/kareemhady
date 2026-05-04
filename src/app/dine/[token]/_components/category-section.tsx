import 'server-only';
import type { Category, Item, Modifier } from '@/lib/beithady/fnb/types';
import { ItemCard } from './item-card';

export function CategorySection({
  category,
  items,
  modifiers,
  outOfStock,
}: {
  category: Category;
  items: Item[];
  modifiers: Modifier[];
  outOfStock: Set<string>;
}) {
  return (
    <section className="relative px-2">
      <h2 className="dine-section-title">{category.name_en}</h2>
      <div>
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            modifiers={modifiers.filter(m => m.item_id === item.id)}
            outOfStock={outOfStock.has(item.id!)}
          />
        ))}
      </div>
      <p className="dine-fineprint">
        Available daily from {category.hours_start.slice(0, 5)} – {category.hours_end.slice(0, 5)}
      </p>
    </section>
  );
}
