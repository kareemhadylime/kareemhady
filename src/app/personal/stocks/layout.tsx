import { PersonalShell, PersonalHeader } from '../_components/personal-shell';
import { TrendingUp } from 'lucide-react';
import { StocksTabNav } from './_components/stocks-shell';

export default function StocksLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonalShell>
      <PersonalHeader
        eyebrow="Personal · finance"
        title="Stock Investment"
        subtitle="AOLB broker statements — holdings, trades, cash flow, dividends, realized + unrealized P&L."
        icon={TrendingUp}
      />
      <StocksTabNav />
      {children}
    </PersonalShell>
  );
}
