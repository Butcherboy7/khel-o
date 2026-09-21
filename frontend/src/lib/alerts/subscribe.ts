import { apiClient } from '@/lib/api/client';

export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'default'
  | 'granted'
  | 'denied';

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

export function getPushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // iOS delivers push only to a PWA added to the home screen; in plain Safari
    // PushManager is simply absent. Telling those users "unsupported" is wrong
    // and loses the channel — they need install instructions instead.
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'default';
}

/**
 * Like getPushState(), but when Notification.permission is 'granted' it also
 * confirms a live browser-side subscription actually exists. Permission can
 * stay 'granted' while the underlying subscription is gone (a partial
 * enablePush() failure, a server-side prune, or VAPID key rotation) — in
 * that case we report 'default' so the UI offers a way to re-enable instead
 * of claiming alerts are on.
 */
export async function resolvePushState(): Promise<PushState> {
  const state = getPushState();
  if (state !== 'granted') return state;
  if (!('serviceWorker' in navigator)) return state;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'granted' : 'default';
  } catch {
    return state;
  }
}

/** base64url VAPID key → Uint8Array, the only format subscribe() accepts. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function enablePush(): Promise<
  'granted' | 'denied' | 'unsupported' | 'unconfigured'
> {
  const state = getPushState();
  if (state === 'unsupported' || state === 'needs-install') return 'unsupported';

  let publicKey: string;
  try {
    const res = await apiClient.get('/api/v1/notifications/push/vapid-key');
    publicKey = res.data.publicKey;
  } catch {
    // 503 — the server has no VAPID keys provisioned.
    return 'unconfigured';
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  await apiClient.post('/api/v1/notifications/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });

  return 'granted';
}

/**
 * Re-POSTs the current live browser subscription to the server. The
 * subscribe endpoint is an idempotent upsert keyed on endpoint, so this is
 * safe to call whenever the owner shell mounts with a 'granted' state — it
 * heals the case where the browser subscription is alive but the server row
 * was pruned (e.g. after a 410 on a stale send).
 */
export async function resyncPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  await apiClient.post('/api/v1/notifications/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  try {
    await apiClient.delete('/api/v1/notifications/push/unsubscribe', {
      data: { endpoint },
    });
  } catch {
    // The browser subscription is already gone, which is what the user asked
    // for. A stale server row will be pruned on its next 410.
  }
}
