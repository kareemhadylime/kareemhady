import type { DashboardReport } from '@/lib/fmplus/types';
export function Dashboard({ data }: { data: DashboardReport }) {
  return (
    <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-[600px]">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
