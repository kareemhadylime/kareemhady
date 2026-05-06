'use client';
interface Row { name: string; required: number; budgeted: number; implied: number; }
export function Dumbbell({ data, max }: { data: Row[]; max: number }) {
  const W = 480, H = data.length * 36 + 16, leftPad = 100, rightPad = 16;
  const xScale = (v: number) => leftPad + ((v / max) * (W - leftPad - rightPad));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="text-slate-300">
      {data.map((r, i) => {
        const y = i * 36 + 24;
        const xs = [r.required, r.budgeted, r.implied].map(xScale);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        return (
          <g key={r.name}>
            <text x={leftPad - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#CBD5E1">{r.name}</text>
            <line x1={minX} y1={y} x2={maxX} y2={y} stroke="#475569" strokeWidth={1.5} />
            <circle cx={xs[0]} cy={y} r={5}  fill="none" stroke="#94A3B8" strokeWidth={1.5}><title>{`Required: ${r.required}`}</title></circle>
            <circle cx={xs[1]} cy={y} r={5}  fill="#EEB91D"><title>{`Budgeted: ${r.budgeted}`}</title></circle>
            <circle cx={xs[2]} cy={y} r={6}  fill="#FDCF00"><title>{`Implied: ${r.implied.toFixed(1)}`}</title></circle>
          </g>
        );
      })}
    </svg>
  );
}
