export type AccountCode = '001' | '003' | '009';
export type Period = 'all' | '2024' | '2025' | '2026';

export type DashboardKpis = {
  cashInEgp: number;
  cashOutEgp: number;
  totalBoughtEgp: number;
  totalSoldEgp: number;
  dividendsEgp: number;
  openPositionsCostEgp: number;
  realizedPnlEgp: number; // 0 until Task 22 wires FIFO
  unrealizedPnlEgp: number; // 0 until prices are entered
};
