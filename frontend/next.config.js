/** @type {import('next').NextConfig} */
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

module.exports = withPWA(nextConfig);
