'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface DailyPoint { date: string; revenue_usd: number; orders: number }

export function RevenueChart() {
  const [data, setData] = useState<DailyPoint[]>([]);
  useEffect(() => {
    fetch('/api/beithady/fnb/analytics/timeseries?days=30')
      .then(r => r.json()).then(j => setData(j.daily ?? []));
  }, []);
  return (
    <div className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-3">Revenue — last 30 days</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="revenue_usd" stroke="#0F3F58" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
