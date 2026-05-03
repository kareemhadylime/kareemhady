import type { BalanceSheetReport } from '@/lib/fmplus/types';
export function BalanceSheetTable({ report }: { report: BalanceSheetReport }) {
  return (
    <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-[600px]">
      {JSON.stringify(report, null, 2)}
    </pre>
  );
}
