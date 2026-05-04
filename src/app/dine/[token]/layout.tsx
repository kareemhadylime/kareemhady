import 'server-only';
import { ReactNode } from 'react';
import { fontDisplay, fontBody, fontArabic } from './_fonts';
import './dine-tokens.css';

export const metadata = {
  title: 'Beit Hady · In-Room Dining',
  description: 'Order food to your apartment.',
};

export const dynamic = 'force-dynamic';

export default function DineLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontArabic.variable}`}
    >
      <body className="min-h-dvh m-0">{children}</body>
    </html>
  );
}
