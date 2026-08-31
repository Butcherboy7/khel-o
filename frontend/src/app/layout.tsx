import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { getPublicEnv } from '@/lib/runtimeEnv';
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

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'KHEL-O — Book Gaming Cafés Near You',
    template: '%s | KHEL-O',
  },
  description:
    'Find and book PC and console gaming cafés near you. Check real-time seat availability, compare prices, and pay online — no calling ahead.',
  keywords: [
    'gaming café',
    'book gaming PC',
    'esports café India',
    'KHEL-O',
    'gaming lounge booking',
    'PS5 café booking',
    'gaming café near me',
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
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'KHEL-O',
    url: SITE_URL,
    title: 'KHEL-O — Book Gaming Cafés Near You',
    description:
      'Find and book PC and console gaming cafés near you. Check real-time seat availability, compare prices, and pay online — no calling ahead.',
  },
  twitter: {
    card: 'summary',
    title: 'KHEL-O — Book Gaming Cafés Near You',
    description:
      'Find and book PC and console gaming cafés near you. Check real-time seat availability, compare prices, and pay online.',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'KHEL-O',
  url: SITE_URL,
  description:
    'KHEL-O is a booking platform for gaming cafés in India. Gamers search for a café, check real-time station availability, book a time slot, and pay online.',
  areaServed: 'IN',
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KHEL-O',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
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
        {/* Injects window.__ENV__ from the container's real runtime env.
            beforeInteractive guarantees this runs before any other script
            (including Sentry's instrumentation-client), so nothing reads a
            stale/missing value. See src/lib/runtimeEnv.ts. */}
        <Script src="/api/runtime-env" strategy="beforeInteractive" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
