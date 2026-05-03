import Link from 'next/link';
import { Mail, Ship, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function PersonalLandingPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 flex-1">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Personal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Personal cockpit</h1>
        <p className="text-sm text-slate-500">
          Apps that don&apos;t belong to a subsidiary.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/personal/email"
          className="group ix-card p-5 relative overflow-hidden hover:shadow-lg transition"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-slate-50 text-slate-700">
              <Mail size={24} />
            </div>
            <ArrowRight size={18} className="text-slate-400 group-hover:text-lime-600 transition" />
          </div>
          <h3 className="text-lg font-bold tracking-tight">Email</h3>
          <p className="text-xs text-slate-500 mt-2">
            Triage GMAIL · LIME · FM+ inboxes by category.
          </p>
        </Link>

        <Link
          href="/emails/boat-rental"
          className="group ix-card p-5 relative overflow-hidden hover:shadow-lg transition"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-700">
              <Ship size={24} />
            </div>
            <ArrowRight size={18} className="text-slate-400 group-hover:text-lime-600 transition" />
          </div>
          <h3 className="text-lg font-bold tracking-tight">Boat Rental</h3>
          <p className="text-xs text-slate-500 mt-2">
            Bookings, payments, owner portal. (Existing — opens at /emails/boat-rental.)
          </p>
        </Link>
      </section>
    </main>
  );
}
