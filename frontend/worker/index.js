// Compiled by next-pwa (customWorkerDir) into public/worker-<hash>.js and
// importScripts'd into the generated sw.js. It must NOT live in public/sw.js —
// next-pwa overwrites that file on every build.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }

  const title = payload.title || 'KHEL-O';
  const body = payload.body || 'You have a new update.';
  const url = payload.url || '/owner/dashboard';
  const dedupeKey = payload.dedupeKey || `${title}:${body}`;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const visibleClient = clientList.find((c) => c.visibilityState === 'visible');

      if (visibleClient) {
        // A tab is on screen. The in-page chime and takeover card are louder and
        // more useful than an OS toast, and firing both would double the alert.
        clientList.forEach((client) => {
          client.postMessage({
            type: 'KHELO_BOOKING_ALERT',
            payload: { title, body, url, dedupeKey, type: payload.type },
          });
        });
        return;
      }

      await self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        // tag + renotify: a retry for the same event replaces the existing
        // toast instead of stacking a second one.
        tag: dedupeKey,
        renotify: true,
        // Keeps it on screen until acknowledged rather than auto-dismissing
        // after a few seconds while nobody is at the counter.
        requireInteraction: true,
        data: { url },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/owner/dashboard';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = clientList.find((c) => c.url.includes('/owner'));
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) {
          await existing.navigate(url);
        }
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
