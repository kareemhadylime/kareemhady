export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div style={{ width: `${clamped * 100}%` }} className="h-full bg-fmplus-yellow transition-[width] duration-300" />
      </div>
      {label && <p className="text-xs text-slate-400 mt-1">{label}</p>}
    </div>
  );
}
