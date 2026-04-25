export default function OwnerSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="space-y-2">
          <div className="h-3 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-7 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      </div>
      <div className="border-b border-slate-200 dark:border-slate-800 mb-6 flex gap-4 pb-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="ix-card overflow-hidden">
            <div className="aspect-[16/10] bg-slate-200 dark:bg-slate-800" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
