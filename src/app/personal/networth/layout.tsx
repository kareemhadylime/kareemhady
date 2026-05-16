import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Net Worth · Lime' };

export default function NetWorthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
