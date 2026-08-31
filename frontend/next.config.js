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
  const isApiRule =
    typeof entry.urlPattern === 'function' &&
    entry.options?.cacheName === 'apis';
  if (!isApiRule) return entry;
  return {
    urlPattern: entry.urlPattern,
    handler: 'NetworkOnly',
    method: 'GET',
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
  });
} catch {
  withPWA = (config) => config;
}

const nextConfig = {
  reactStrictMode: true,
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
