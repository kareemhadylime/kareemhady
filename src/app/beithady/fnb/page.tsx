import 'server-only';

export const dynamic = 'force-dynamic';

export default async function FnbOrdersPage() {
  return (
    <div className="ix-card p-8 text-center max-w-xl mx-auto">
      <h2 className="text-lg font-semibold">Orders coming soon</h2>
      <p className="text-sm text-slate-500 mt-1">
        Operator queue ships in Phase F.5. The tile, role, and DB schema are
        live (Phase F.1).
      </p>
    </div>
  );
}
