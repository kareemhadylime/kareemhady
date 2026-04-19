import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function EmailsHome() {
  return (
    <main className="max-w-5xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Home
        </Link>
      </nav>

      <header>
        <h1 className="text-3xl font-bold">Emails</h1>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          href="/emails/output"
          className="block border rounded-lg p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-xl font-semibold mb-1">Rules output</h2>
          <p className="text-sm text-gray-500">
            Latest aggregated reports for each rule.
          </p>
        </Link>
      </section>
    </main>
  );
}
