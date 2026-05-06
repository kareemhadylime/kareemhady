import { supabaseAdmin } from '@/lib/supabase';
import { SetupTabs } from '../_components/setup-tabs';
import { updateCategory } from './actions';

export const dynamic = 'force-dynamic';

export default async function CategoriesSetupPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_email_categories')
    .select('*')
    .order('tier', { ascending: true })
    .order('sort_order', { ascending: true });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">Categories</h1>
      <SetupTabs activeTab="categories" />

      <p className="text-xs text-slate-500">
        Toggle a category off to hide it from the triage view (existing classifications are preserved).
        Renaming the Gmail label here also requires re-running &ldquo;Connect Gmail&rdquo; to apply the new
        name to existing Gmail labels.
      </p>

      <div className="ix-card divide-y divide-slate-100">
        {(data ?? []).map((c: any) => (
          <form key={c.slug} action={updateCategory.bind(null, c.slug)} className="p-4 grid grid-cols-12 gap-3 items-end">
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Tier {c.tier} · {c.slug}</div>
              <div className={`text-xs font-mono px-1.5 py-0.5 rounded inline-block bg-${c.accent_color}-50 text-${c.accent_color}-700 mt-1`}>
                {c.accent_color}
              </div>
            </div>
            <label className="col-span-3 block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Display name</span>
              <input name="display_name" defaultValue={c.display_name} className="ix-input" />
            </label>
            <label className="col-span-4 block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Gmail label name</span>
              <input name="gmail_label_name" defaultValue={c.gmail_label_name} className="ix-input font-mono text-xs" />
            </label>
            <label className="col-span-2 flex items-center gap-2 pt-5">
              <input type="checkbox" name="is_enabled" defaultChecked={c.is_enabled} />
              <span className="text-sm">Enabled</span>
            </label>
            <button type="submit" className="ix-btn-secondary col-span-1">Save</button>
          </form>
        ))}
      </div>
    </main>
  );
}
