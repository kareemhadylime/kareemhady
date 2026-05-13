'use client';
import { Trash2 } from 'lucide-react';
import type { SecurityBuildingConfig, SecurityPost } from '@/lib/beithady/hc-estimator-types';

function newPost(): SecurityPost {
  return { id: crypto.randomUUID(), name: '', dayShift: 0, nightShift: 0, allDay: 0 };
}

export function SecurityBuildingCard({
  config,
  onChange,
}: {
  config: SecurityBuildingConfig;
  onChange: (updated: SecurityBuildingConfig) => void;
}) {
  const dayTotal    = config.posts.reduce((s, p) => s + p.dayShift + p.allDay, 0);
  const nightTotal  = config.posts.reduce((s, p) => s + p.nightShift + p.allDay, 0);
  const allDayCount = config.posts.reduce((s, p) => s + p.allDay, 0);

  const update = (id: string, field: keyof SecurityPost, value: string | number) =>
    onChange({
      ...config,
      posts: config.posts.map(p =>
        p.id === id
          ? { ...p, [field]: field === 'name' ? value : Math.max(0, Number(value)) }
          : p
      ),
    });

  const addRow    = () => onChange({ ...config, posts: [...config.posts, newPost()] });
  const removeRow = (id: string) => onChange({ ...config, posts: config.posts.filter(p => p.id !== id) });

  return (
    <div className="ix-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{config.building}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
              <th className="text-left py-1 pr-2 w-40">Post</th>
              <th className="text-right py-1 px-2 w-20">Day (9–5)</th>
              <th className="text-right py-1 px-2 w-20">Night (5–1)</th>
              <th className="text-right py-1 px-2 w-16">24hr</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {config.posts.map(post => (
              <tr key={post.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-2">
                  <input
                    value={post.name}
                    onChange={e => update(post.id, 'name', e.target.value)}
                    placeholder="Post name"
                    className="w-full px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                  />
                </td>
                {(['dayShift', 'nightShift', 'allDay'] as const).map(field => (
                  <td key={field} className="py-1 px-2">
                    <input
                      type="number"
                      min={0}
                      value={post[field]}
                      onChange={e => update(post.id, field, e.target.value)}
                      className="w-full text-right px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                    />
                  </td>
                ))}
                <td className="py-1 pl-1">
                  <button onClick={() => removeRow(post.id)} className="text-slate-400 hover:text-rose-500">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="text-slate-500 font-semibold border-t border-slate-200 dark:border-slate-700">
              <td className="py-1 pr-2">Total</td>
              <td className="py-1 px-2 text-right">{dayTotal}</td>
              <td className="py-1 px-2 text-right">{nightTotal}</td>
              <td className="py-1 px-2 text-right">{allDayCount > 0 ? `${allDayCount} ×2` : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
      >
        + Add Post
      </button>
    </div>
  );
}
