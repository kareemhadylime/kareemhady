import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { SettingsTabs } from '../_components/settings-tabs';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const sb = supabaseAdmin();
  const ids = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith('hours_start_')) ids.add(key.replace('hours_start_', ''));
  }
  for (const id of ids) {
    const start = String(formData.get(`hours_start_${id}`) ?? '08:00');
    const end = String(formData.get(`hours_end_${id}`) ?? '23:59');
    const before = await sb.from('fnb_categories').select('*').eq('id', id).single();
    await sb.from('fnb_categories')
      .update({ hours_start: start, hours_end: end } as never)
      .eq('id', id);
    await recordAudit({
      module: 'fnb',
      actor_user_id: user.id,
      action: 'category.hours_update',
      target_type: 'category',
      target_id: id,
      before: before.data,
      after: { hours_start: start, hours_end: end },
    });
  }
  revalidatePath('/beithady/fnb/settings/hours');
}

export default async function HoursSettings() {
  await requireBeithadyPermission('fnb', 'full');
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_categories').select('*').order('sort_order');
  const categories = (data ?? []) as Array<{ id: string; name_en: string; hours_start: string; hours_end: string }>;
  return (
    <>
      <SettingsTabs />
      <form action={save} className="ix-card p-4 space-y-3">
        <p className="text-xs text-slate-500 mb-2">
          Per-category default operating hours. Items can override individually in the Menu admin.
        </p>
        {categories.map(c => (
          <div key={c.id} className="grid grid-cols-3 gap-2 items-baseline">
            <span className="text-sm font-medium">{c.name_en}</span>
            <input
              name={`hours_start_${c.id}`}
              defaultValue={c.hours_start}
              placeholder="08:00"
              className="ix-input"
            />
            <input
              name={`hours_end_${c.id}`}
              defaultValue={c.hours_end}
              placeholder="23:59"
              className="ix-input"
            />
          </div>
        ))}
        <button className="ix-btn-primary px-3 py-1.5 text-sm">Save hours</button>
      </form>
    </>
  );
}
