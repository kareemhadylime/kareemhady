import Link from 'next/link';

export default function PropertyNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <h1 className="text-4xl font-bold mb-3">Property not found</h1>
      <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">
        We couldn&apos;t find a Beit Hady property at this URL. It may have been retired or the link is misspelled.
      </p>
      <Link href="https://wa.me/201101300300" className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-md font-semibold">
        Message us on WhatsApp →
      </Link>
    </main>
  );
}
