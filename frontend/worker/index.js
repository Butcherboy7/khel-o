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

      // Only owner-shell windows (/owner/*) mount OwnerAlertProvider, which is
      // the only thing listening for postMessage. A visible tab on some other
      // KHEL-O page (e.g. /cafes) has no listener, so it must not suppress the
      // OS notification.
      const ownerClients = clientList.filter((c) => c.url.includes('/owner'));
      const visibleClient = ownerClients.find((c) => c.visibilityState === 'visible');

      if (visibleClient) {
        // A tab is on screen. The in-page chime and takeover card are louder and
        // more useful than an OS toast, and firing both would double the alert.
        ownerClients.forEach((client) => {
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

// Fires when the browser itself invalidates/renews a push subscription
// (e.g. it expired or the browser rotated it) — distinct from server-side
// VAPID key rotation, which the browser cannot detect on its own. Mirrors
// the subscribe-then-POST sequence in enablePush() (frontend/src/lib/alerts/
// subscribe.ts). Never throws: a SW event handler that throws can break the
// worker for unrelated events.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let subscription = event.newSubscription;

        if (!subscription) {
          const keyRes = await fetch('/api/v1/notifications/push/vapid-key', {
            credentials: 'include',
          });
          if (!keyRes.ok) return;
          const { publicKey } = await keyRes.json();

          const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
          const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const raw = atob(base64);
          const applicationServerKey = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i += 1) applicationServerKey[i] = raw.charCodeAt(i);

          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        const json = subscription.toJSON();
        await fetch('/api/v1/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          }),
        });
      } catch (err) {
        // Best-effort recovery. If this fails (e.g. no cookie-based session
        // reachable from the SW), EnableAlertsCard's mount-time
        // resolvePushState()/resyncPushSubscription() checks catch the dead
        // subscription next time the owner opens the app.
      }
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
