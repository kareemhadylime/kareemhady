import type { PnlReport } from '@/lib/fmplus/types';
export function PnlTable({ report }: { report: PnlReport }) {
  return (
    <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-[600px]">
      {JSON.stringify(report, null, 2)}
    </pre>
  );
}
