// Skeleton loader shown during streaming/navigation while the admin
// dashboard's parallel queries resolve. Matches the layout shape so the
// page doesn't shift when content lands.

export default function AdminDashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-7 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3 w-72 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      </header>

      <div className="border-b border-slate-200 dark:border-slate-800 mb-6 flex gap-4 pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
        ))}
      </div>

      <div className="ix-card p-4 mb-6 flex gap-2 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
        ))}
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ix-card p-4 h-24" />
        ))}
      </section>

      <section className="mt-6 ix-card p-5 h-40" />
      <section className="mt-4 ix-card p-5 h-32" />
    </div>
  );
}
