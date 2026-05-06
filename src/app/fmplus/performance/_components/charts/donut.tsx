'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
const COLORS = ['#FDCF00', '#EEB91D', '#F97316', '#22C55E', '#64748B', '#94A3B8', '#CBD5E1', '#EF4444'];
export function Donut({ data, onSliceClick }: {
  data: { name: string; value: number; id?: string }[];
  onSliceClick?: (id: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={2}
          onClick={(d: { id?: string }) => d.id && onSliceClick?.(d.id)}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />)}
        </Pie>
        <Tooltip
          formatter={(v: number, name: string) => [v.toLocaleString('en-EG'), name]}
          contentStyle={{ background: '#0F172A', border: '1px solid #334155', color: 'white' }}
          labelStyle={{ color: '#FDCF00', fontWeight: 600 }}
          itemStyle={{ color: 'white' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
