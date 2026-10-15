import type { Metadata } from 'next';
import { Bebas_Neue, Lato } from 'next/font/google';
import './globals.css';
import './shop.css';
import { Providers } from './providers';

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bebas',
});

const lato = Lato({
  weight: ['300', '400', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lato',
});

export const metadata: Metadata = {
  title: {
    default: 'Prozone',
    template: '%s · Prozone',
  },
  description: 'A secure panel where you can buy data, accounts and digital services.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${bebas.variable} ${lato.variable}`}>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}