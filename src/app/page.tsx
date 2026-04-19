import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto p-8 space-y-10">
      <header>
        <h1 className="text-3xl font-bold">InboxOps</h1>
        <p className="text-sm text-gray-500">Daily email digest · Phase 2</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          href="/admin"
          className="block border rounded-lg p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-1">Admin</h2>
          <p className="text-sm text-gray-500">
            Connected mailboxes and email rules.
          </p>
        </Link>

        <Link
          href="/emails"
          className="block border rounded-lg p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-1">Emails</h2>
          <p className="text-sm text-gray-500">
            Rule outputs and aggregated reports.
          </p>
        </Link>
      </section>
    </main>
  );
}
