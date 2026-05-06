'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
interface Row { name: string; budget: number; actual: number; status: 'good' | 'warn' | 'bad'; id: string; }
const STATUS_COLORS: Record<Row['status'], string> = { good: '#22C55E', warn: '#F97316', bad: '#EF4444' };
export function GroupedBars({ data, onRowClick }: { data: Row[]; onRowClick?: (id: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 16 }}>
        <XAxis type="number" tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} stroke="#94A3B8" />
        <YAxis type="category" dataKey="name" stroke="#CBD5E1" />
        <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155', color: 'white' }} formatter={(v: number) => v.toLocaleString('en-EG')} />
        <Bar dataKey="budget" fill="#94A3B8" onClick={(d: unknown) => onRowClick?.((d as Row).id)} />
        <Bar dataKey="actual" onClick={(d: unknown) => onRowClick?.((d as Row).id)}>
          {data.map((r, i) => <Cell key={i} fill="#FDCF00" stroke={STATUS_COLORS[r.status]} strokeWidth={1} className="cursor-pointer" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
