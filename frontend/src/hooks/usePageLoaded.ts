'use client';

import { useSyncExternalStore } from 'react';
import { afterPageLoad } from '@/lib/afterPageLoad';

let loaded = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  afterPageLoad().then(() => {
    if (loaded) return;
    loaded = true;
    listeners.forEach((listener) => listener());
  });
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * False until the page has loaded and gone idle (see afterPageLoad), then
 * true for the rest of the visit. Links in the app shell and on café cards
 * use it to hold their prefetch back, so those background page downloads
 * don't compete with the first screen:
 *   <Link prefetch={pageLoaded ? undefined : false} …>
 * Pages opened later in the visit see true straight away.
 */
export function usePageLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded, () => false);
}
