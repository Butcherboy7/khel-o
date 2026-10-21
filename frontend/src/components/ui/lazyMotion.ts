'use client';

import { useSyncExternalStore } from 'react';
import { afterPageLoad } from '@/lib/afterPageLoad';

/**
 * Modal and BottomSheet animate with framer-motion, and one of them is on
 * every customer page (the phone-number prompt, the café filters), so the
 * whole library used to be part of the first download — PageSpeed counted
 * 37 of its 41 KB unused there. They now render `m` elements inside
 * <LazyMotion features={motionFeaturesAfterLoad}>, and the animation engine
 * arrives once the page has loaded, or as soon as a sheet opens if that is
 * sooner.
 *
 * A sheet that opens before the engine is here renders straight in its open
 * state (initial={false}) instead of sitting invisible at its start frame.
 */

type Features = typeof import('./motionFeatures').default;

let features: Promise<Features> | undefined;
let ready = false;
const listeners = new Set<() => void>();
let wantedNow: () => void = () => {};
const wanted = new Promise<void>((resolve) => {
  wantedNow = resolve;
});

/** Fetches the engine now (a sheet is opening). */
export function loadMotionFeatures(): Promise<Features> {
  wantedNow();
  if (!features) {
    features = import('./motionFeatures').then((mod) => {
      ready = true;
      listeners.forEach((listener) => listener());
      return mod.default;
    });
  }
  return features;
}

/** For <LazyMotion features>: after the page has loaded, or when a sheet opens. */
export const motionFeaturesAfterLoad = (): Promise<Features> =>
  Promise.race([afterPageLoad(), wanted]).then(loadMotionFeatures);

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** True once the animation engine has loaded. */
export function useMotionReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}
