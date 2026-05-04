import { Cormorant_Garamond, Poppins, Cairo } from 'next/font/google';

export const fontDisplay = Cormorant_Garamond({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--bh-font-display',
  display: 'swap',
});

export const fontBody = Poppins({
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext'],
  variable: '--bh-font-body',
  display: 'swap',
});

export const fontArabic = Cairo({
  weight: ['400', '600'],
  subsets: ['arabic'],
  variable: '--bh-font-arabic',
  display: 'swap',
});
