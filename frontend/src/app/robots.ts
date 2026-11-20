import type { MetadataRoute } from 'next';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

export default function robots(): MetadataRoute.Robots {
  // Search and answer engines that read the web to answer questions are welcome on the public pages.
  const answerBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];
  const publicAllow = ['/', '/gta6', '/cafe/', '/cafes/', '/browse', '/about', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/contact'];
  const privateDisallow = ['/owner', '/admin', '/profile', '/notifications', '/achievements', '/bookings', '/support', '/login', '/register', '/forgot-password', '/reset-password', '/accept-invitation', '/debug'];
  return {
    rules: [{ userAgent: answerBots, allow: publicAllow, disallow: privateDisallow }, {
      userAgent: '*',
      allow: ['/', '/gta6', '/cafe/', '/cafes/', '/browse', '/about', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/contact'],
      disallow: [
        '/owner',
        '/admin',
        '/profile',
        '/notifications',
        '/achievements',
        '/bookings',
        '/support',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/accept-invitation',
        '/debug',
      ],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
