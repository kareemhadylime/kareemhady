'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export function PortfolioChart({
  data,
}: {
  data: { date: string; cost: number }[];
}) {
  return (
    <div className="ix-card p-3">
      <div className="text-sm font-semibold mb-2">
        Portfolio cost basis over time
      </div>
      <div className="h-44">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) =>
                Math.abs(v) >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : `${(v / 1000).toFixed(0)}k`
              }
            />
            <Tooltip formatter={(v: number) => v.toLocaleString()} />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#0ea5e9"
              fill="#bae6fd"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
