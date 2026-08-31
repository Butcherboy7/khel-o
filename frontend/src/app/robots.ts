import type { MetadataRoute } from 'next';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/cafe/', '/partner', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/contact'],
      disallow: [
        '/owner',
        '/admin',
        '/profile',
        '/notifications',
        '/rewards',
        '/bookings',
        '/support',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/accept-invitation',
        '/debug',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
