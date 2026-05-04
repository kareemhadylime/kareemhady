import { describe, it, expect } from 'vitest';
import {
  listCategories, listItems, createItem, softDeleteItem,
} from './repo';

const skip = !process.env.SUPABASE_URL;
const t = skip ? it.skip : it;

describe('fnb repo', () => {
  t('lists seeded categories', async () => {
    const cats = await listCategories();
    expect(cats.map(c => c.slug)).toEqual(
      expect.arrayContaining(['breakfast','sandwiches','salads-and-kids']),
    );
  });
  t('creates and soft-deletes an item', async () => {
    const cats = await listCategories();
    const created = await createItem({
      slug: `test-item-${Date.now()}`,
      category_id: cats[0].id!,
      name_en: 'Test Item',
      price_usd: 5.00,
      sort_order: 99,
    }, { actor_user_id: null });
    expect(created.id).toBeDefined();
    await softDeleteItem(created.id!, { actor_user_id: null });
    const items = await listItems({ includeDeleted: false });
    expect(items.find(i => i.id === created.id)).toBeUndefined();
  });
});
