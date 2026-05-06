'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
interface Row { name: string; variance_pct: number; status: 'good' | 'warn' | 'bad'; id: string; }
const STATUS: Record<Row['status'], string> = { good: '#22C55E', warn: '#F97316', bad: '#EF4444' };
export function DivergingBars({ data, onRowClick }: { data: Row[]; onRowClick?: (id: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 16 }}>
        <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[-1, 1]} stroke="#94A3B8" />
        <YAxis type="category" dataKey="name" stroke="#CBD5E1" />
        <ReferenceLine x={0} stroke="#475569" />
        <Tooltip
          contentStyle={{ background: '#0F172A', border: '1px solid #334155', color: 'white' }}
          formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Variance']}
          labelStyle={{ color: '#FDCF00', fontWeight: 600 }}
          itemStyle={{ color: 'white' }}
        />
        <Bar dataKey="variance_pct" name="Variance" onClick={(d: unknown) => onRowClick?.((d as Row).id)}>
          {data.map((r, i) => <Cell key={i} fill={STATUS[r.status]} className="cursor-pointer" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
