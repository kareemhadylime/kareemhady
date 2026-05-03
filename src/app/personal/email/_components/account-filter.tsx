import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';

export async function AccountFilter({
  selected,
  basePath = '/personal/email',
}: { selected?: string; basePath?: string }) {
  const sb = supabaseAdmin();
  const { data: accounts } = await sb
    .from('accounts')
    .select('id, email, display_name')
    .eq('domain', 'personal')
    .eq('enabled', true)
    .order('display_name');

  const pill = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {(accounts ?? []).map((a: any) =>
        pill(a.display_name ?? a.email, `${basePath}?account=${a.id}`, selected === a.id),
      )}
      {pill('All', basePath, !selected)}
    </div>
  );
}
