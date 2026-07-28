import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'KHEL-O — Gaming Café Marketplace India',
  description: 'Discover nearby gaming cafés, compare RTX/PS5 hardware tiers, and grab off-peak flash deal discounts.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'KHEL-O',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#7c3aed',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-purple-600 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
