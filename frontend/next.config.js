/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

// P0-B2: next-pwa's DEFAULT runtimeCaching (node_modules/next-pwa/cache.js)
// includes a catch-all rule that NetworkFirst-caches every same-origin
// `/api/*` GET response except `/api/auth/*` — that means an authenticated
// response like GET /api/bookings gets stored under that URL in the Cache
// Storage API. If a second user signs in on the same browser/device (shared
// kiosk PC, family device) and the network is slow or briefly unavailable
// within the 10s timeout, the service worker can serve User A's cached
// booking/profile/payment data to User B. There is no per-user cache key
// here, so the only safe fix is to never cache API responses at all —
// override the default list with NetworkOnly for every `/api/*` route.
// Static assets (JS/CSS/fonts/images) keep next-pwa's normal defaults,
// which are not user-specific.
const defaultRuntimeCaching = require('next-pwa/cache');
const runtimeCaching = defaultRuntimeCaching.map((entry) => {
  // Café photos: a photo URL never changes its bytes (uploads get a fresh
  // random key), so once a size is on the phone it is served from there
  // with no network at all. The default (StaleWhileRevalidate, 64 photos,
  // one day) re-downloaded every photo on every view and forgot them by the
  // next day. ~300 resized WebPs is roughly 15 MB.
  if (entry.options?.cacheName === 'next-image') {
    return {
      ...entry,
      handler: 'CacheFirst',
      options: {
        ...entry.options,
        expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
      },
    };
  }
  const isApiRule =
    typeof entry.urlPattern === 'function' &&
    entry.options?.cacheName === 'apis';
  if (!isApiRule) return entry;
  return {
    urlPattern: entry.urlPattern,
    handler: 'NetworkOnly',
    method: 'GET',
    // next-pwa's `fallbacks` reads every rule's options and crashes the build
    // without one. For an API request its fallback only ever answers
    // Response.error() (the offline page is for documents), same as no rule.
    options: {},
  };
});

let withPWA;
try {
  withPWA = require('next-pwa')({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    // P0-B3: a new service worker used to call self.skipWaiting()
    // unconditionally, so the moment a new deployment finished building, it
    // silently took over every open tab mid-session — including someone
    // mid-checkout. If that deployment had a broken booking/payment flow,
    // users were yanked onto it with no warning. Disabling this means a
    // waiting worker no longer force-activates during a live session; it
    // takes over the next time the app is opened fresh instead.
    skipWaiting: false,
    runtimeCaching,
    // Push handlers cannot live in public/sw.js — next-pwa regenerates that
    // file on every build. next-pwa compiles worker/index.js separately and
    // importScripts it into the generated worker.
    customWorkerDir: 'worker',
    // public/thanks/ holds certificate PDFs and images for one person each;
    // precaching them would make every visitor download them in the background.
    publicExcludes: ['!noprecache/**/*', '!thanks/**/*'],
    // No signal: show our own page (src/app/offline) instead of the browser's
    // error page — in the Android app that would look like the app is broken.
    fallbacks: { document: '/offline' },
  });
} catch {
  withPWA = (config) => config;
}

const nextConfig = {
  reactStrictMode: true,
  // Traces the actual dependency graph into .next/standalone instead of
  // shipping the whole node_modules in the runtime Docker image — see
  // frontend/Dockerfile runner stage.
  output: 'standalone',
  // Café photos go through /_next/image (see src/lib/imageUrl.ts): resized
  // per screen, WebP/AVIF, browser-cached. Only these hosts may be fetched,
  // so the optimizer can't be used as an open image proxy.
  images: {
    // WebP only. AVIF was a few KB smaller but took 9 s to convert the six
    // photos of a café page on our 2-CPU box (WebP: 1 s), and every deploy
    // starts with an empty cache, so real visitors kept paying that.
    formats: ['image/webp'],
    // Only our own buckets (+ Unsplash for lead listings). A wildcard let
    // anyone make our server fetch and convert images from any S3 bucket.
    // Keep in sync with OPTIMIZABLE in src/lib/imageUrl.ts.
    remotePatterns: [
      { protocol: 'https', hostname: 'khelo-cafe-photos-prod.s3.ap-south-1.amazonaws.com' },
      { protocol: 'https', hostname: 'khelo-cafe-photos-dev.s3.ap-south-1.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    // Uploaded photos get a fresh random key, so a URL's bytes never change:
    // cache optimized copies for 30 days.
    minimumCacheTTL: 2592000,
  },
  async redirects() {
    // The page was called Rewards before it became Achievements.
    return [{ source: '/rewards', destination: '/achievements', permanent: true }];
  },
  async rewrites() {
    // Thank-you pages for interns are plain HTML in public/thanks/ (built by marketing/certificates/).
    return [{ source: '/thanks/maleeha', destination: '/thanks/maleeha.html' }];
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@tanstack/react-query'],
  },
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  silent: !process.env.CI,
};

module.exports = process.env.NODE_ENV === 'production'
  ? withSentryConfig(withPWA(nextConfig), sentryWebpackPluginOptions)
  : withPWA(nextConfig);
