import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AdminHome() {
  return (
    <main className="max-w-5xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Home
        </Link>
      </nav>

      <header>
        <h1 className="text-3xl font-bold">Admin</h1>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          href="/admin/accounts"
          className="block border rounded-lg p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-1">Connected emails</h2>
          <p className="text-sm text-gray-500">
            Manage Gmail mailboxes and view ingest runs.
          </p>
        </Link>

        <Link
          href="/admin/rules"
          className="block border rounded-lg p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-1">Email rules</h2>
          <p className="text-sm text-gray-500">
            Create rules that filter and process incoming emails.
          </p>
        </Link>
      </section>
    </main>
  );
}
