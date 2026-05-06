import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { ImportUploader } from './_components/import-uploader';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requireBudgetView();

  return (
    <div className="space-y-4">
      {user.is_admin ? (
        <ImportUploader />
      ) : (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6 text-xs text-slate-500 dark:text-slate-400 italic text-center">
          Imports require admin role.
        </div>
      )}
    </div>
  );
}
