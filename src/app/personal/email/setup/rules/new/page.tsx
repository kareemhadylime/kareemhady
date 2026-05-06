import { RuleForm } from '../_form';
import { SetupTabs } from '../../_components/setup-tabs';

export const dynamic = 'force-dynamic';

export default function NewRulePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">New rule</h1>
      <SetupTabs activeTab="rules" />
      <RuleForm />
    </main>
  );
}
