import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  sendDefaultPii: true,
  
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  enableLogs: true,
  
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
