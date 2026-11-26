import type { MetadataRoute } from 'next';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

const PUBLIC_ALLOW = ['/', '/gta6', '/valorant', '/challenge/', '/community','/cafe/', '/cafes/', '/browse', '/guides', '/about', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/contact'];
const PRIVATE_DISALLOW = [
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
];

export default function robots(): MetadataRoute.Robots {
  // Each group below is its own policy. A crawler that has its own group ignores the `*` group,
  // so every group repeats the same allow/disallow lists on purpose.
  //
  // 1. Search and answer-retrieval crawlers: they fetch pages so KHEL-O can be found and cited
  //    in ChatGPT Search (OAI-SearchBot), when a user asks ChatGPT to open a link (ChatGPT-User),
  //    Claude search, Perplexity, and Bing (bingbot also feeds ChatGPT Search and Copilot).
  //    Keep these allowed: blocking OAI-SearchBot removes KHEL-O from ChatGPT Search answers.
  const retrievalBots = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'PerplexityBot', 'bingbot'];
  // 2. Model-training crawlers. Current policy: ALLOWED (unchanged). Allowing GPTBot lets OpenAI
  //    use public KHEL-O pages to train models; it does not affect ChatGPT Search visibility,
  //    which is OAI-SearchBot above. To opt out of training only, move 'GPTBot' to its own rule
  //    with `disallow: '/'`; OAI-SearchBot stays allowed either way.
  const trainingBots = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended'];
  return {
    rules: [
      { userAgent: retrievalBots, allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
      { userAgent: trainingBots, allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
      { userAgent: '*', allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
