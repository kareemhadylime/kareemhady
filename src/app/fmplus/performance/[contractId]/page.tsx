export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ contractId: string }> }

export default async function PerformanceContractPage(props: Props) {
  const { contractId } = await props.params;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Performance — Contract #{contractId}</h1>
      <p className="text-sm text-slate-500 mt-2">Coming soon.</p>
    </div>
  );
}
