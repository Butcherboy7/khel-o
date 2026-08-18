import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import '../globals.css';

/* ── Font Loading ────────────────────────────────────────────────── */

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
  weight: ['600', '700'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '600', '700'],
});

/* ── Metadata ────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://khelo.app',
  ),
  title: {
    default: 'KHEL-O — Book Gaming Cafés Near You',
    template: '%s | KHEL-O',
  },
  description:
    'Discover and book verified gaming cafés across India. Premium PCs, consoles, and immersive setups — one tap away.',
  keywords: [
    'gaming café',
    'book gaming PC',
    'esports café India',
    'KHEL-O',
    'gaming lounge booking',
  ],
  authors: [{ name: 'KHEL-O' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KHEL-O',
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'KHEL-O',
    title: 'KHEL-O — Book Gaming Cafés Near You',
    description:
      'Discover and book verified gaming cafés across India. Premium PCs, consoles, and immersive setups — one tap away.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#10B981',
};

/* ── Root Layout ─────────────────────────────────────────────────── */

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-body bg-surface text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
