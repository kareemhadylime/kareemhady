'use client';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
export function Sparkline({ data, color = '#FDCF00', height = 24 }: { data: { date: string; value: number }[]; color?: string; height?: number }) {
  if (!data?.length) return null;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
