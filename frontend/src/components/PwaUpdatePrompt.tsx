'use client';

import { useEffect, useState } from 'react';

/**
 * P0-B3: the service worker no longer force-activates a new deployment onto
 * a live session (skipWaiting is off — see next.config.js). Without this
 * component, a waiting worker would just sit there until the user happens to
 * close every tab, so most users would never get the new version. This
 * surfaces it explicitly and lets them choose when to reload.
 */
export function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    const onUpdateFound = () => {
      const installingWorker = registration?.installing;
      if (!installingWorker) return;
      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(installingWorker);
        }
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
      }
      reg.addEventListener('updatefound', onUpdateFound);
    });

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      registration?.removeEventListener('updatefound', onUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;

  const applyUpdate = () => {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-3 border-t border-border bg-surface px-4 py-3 text-sm text-text-primary shadow-lg"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <span>A new version of KHEL-O is available.</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="rounded-full bg-primary px-4 py-1.5 font-medium text-white"
      >
        Update
      </button>
    </div>
  );
}
