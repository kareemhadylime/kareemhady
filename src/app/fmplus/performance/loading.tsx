export default function Loading() {
  return (
    <div className="flex-1 px-6 py-6 max-w-6xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ix-card p-4 animate-pulse">
            <div className="h-3 w-16 bg-slate-700 rounded" />
            <div className="h-8 w-24 bg-slate-700 rounded mt-2" />
            <div className="h-3 w-12 bg-slate-700 rounded mt-2" />
          </div>
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="ix-card p-6 animate-pulse">
          <div className="h-4 w-48 bg-slate-700 rounded mb-3" />
          <div className="h-48 w-full bg-slate-800 rounded" />
        </div>
      ))}
    </div>
  );
}
