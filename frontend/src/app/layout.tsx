import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KHEL-O — Gaming Café Marketplace India',
  description: 'Discover nearby gaming cafés, compare RTX/PS5 hardware tiers, and grab off-peak flash deal discounts.',
  manifest: '/manifest.json',
  themeColor: '#7c3aed',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-purple-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
