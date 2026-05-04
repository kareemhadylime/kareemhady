import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { ImportUploader } from './_components/import-uploader';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requireBudgetView();

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-base font-semibold text-text-primary">Import</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Upload an XLSX to populate budget_lines. v2.0 supports the flat template format.
          {!user.is_admin && <span className="ml-1 text-amber-400">View-only — admin role required to import.</span>}
        </p>
      </header>

      {user.is_admin ? (
        <ImportUploader />
      ) : (
        <div className="border border-border rounded-lg p-6 text-xs text-text-secondary italic text-center">
          Imports require admin role.
        </div>
      )}
    </div>
  );
}
