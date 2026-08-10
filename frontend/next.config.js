/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

let withPWA;
try {
  withPWA = require('next-pwa')({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
  });
} catch {
  withPWA = (config) => config;
}

const nextConfig = {
  reactStrictMode: true,
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  silent: !process.env.CI,
};

module.exports = withSentryConfig(withPWA(nextConfig), sentryWebpackPluginOptions);
