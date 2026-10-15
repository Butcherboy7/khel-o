import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { CookieConsentBanner } from '@/components/layout/CookieConsentBanner';
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
  // Google Search Console ownership check — set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
  // to the token from Search Console's "HTML tag" method; omitted when unset.
  verification: getPublicEnv('NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION', '')
    ? { google: getPublicEnv('NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION', '') }
    : undefined,
  title: {
    default: 'KHEL-O — Book Gaming Cafés & Game Zones Near You',
    template: '%s | KHEL-O',
  },
  description:
    'Find and book gaming cafés, VR, snooker, pool and bowling near you. See live availability, compare prices and pay online — no calling ahead.',
  keywords: [
    'gaming café',
    'book gaming PC',
    'esports café India',
    'KHEL-O',
    'gaming lounge booking',
    'PS5 café booking',
    'gaming café near me',
    'snooker booking',
    'pool table near me',
    'bowling alley booking',
    'VR gaming near me',
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
  // No site-wide canonical: a child page without its own would inherit '/' and
  // tell Google it is a copy of the homepage. Each public page sets its own.
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'KHEL-O',
    url: SITE_URL,
    title: 'KHEL-O — Book Gaming Cafés & Game Zones Near You',
    description:
      'Find and book gaming cafés, VR, snooker, pool and bowling near you. See live availability, compare prices and pay online — no calling ahead.',
    images: [{ url: '/og/khelo-share.png', width: 1200, height: 630, alt: 'KHEL-O: book gaming cafés, snooker and bowling in Hyderabad' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og/khelo-share.png'],
    title: 'KHEL-O — Book Gaming Cafés & Game Zones Near You',
    description:
      'Find and book gaming cafés, VR, snooker, pool and bowling near you. See live availability, compare prices and pay online.',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'KHEL-O',
  // How people actually type it; keeps KHEL-O apart from Khelo India and similar names.
  alternateName: ['KHELO', 'Khel-O', 'khel-o.com'],
  url: SITE_URL,
  logo: `${SITE_URL}/brand/khelo-logo-512.png`,
  // The profiles linked in the footer (components/layout/SocialLinks.tsx).
  sameAs: [
    'https://www.instagram.com/khelo.journey/',
    'https://www.youtube.com/@khel-o.journey',
    'https://x.com/khheloo',
    'https://www.threads.com/@khelo.support',
    'https://www.linkedin.com/company/khel-o/',
    'https://www.reddit.com/user/Khelo_journey/',
  ],
  description:
    'KHEL-O is a booking platform for gaming cafés, snooker clubs and bowling alleys in Hyderabad, India. Players find a venue, check real-time availability, book a slot and pay online.',
  areaServed: { '@type': 'City', name: 'Hyderabad' },
  founder: {
    '@type': 'Person',
    name: 'Mohammed Abdullah',
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Hyderabad',
    addressRegion: 'Telangana',
    addressCountry: 'IN',
  },
  email: 'hello@khel-o.com',
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KHEL-O',
  url: SITE_URL,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#10B981',
  // Without this, iOS Safari letterboxes the page above the home indicator and
  // every env(safe-area-inset-*) in the app resolves to 0px — which silently
  // no-ops the offsets the sticky payment/booking bars are positioned with, so
  // they sit at the wrong height and drift as the URL bar collapses. Any
  // element that consumes a safe-area inset depends on this being set.
  viewportFit: 'cover',
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
        <CookieConsentBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
