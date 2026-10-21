/**
 * Resolves once the page has finished loading and the browser has a spare
 * moment. Work nobody sees on the first screen (error reporting, link
 * prefetching, sheet animations) waits for this, so the first café photo
 * gets the phone's bandwidth and CPU. PageSpeed (21 Oct) counted Sentry,
 * prefetched pages and the motion library all downloading before that photo.
 *
 * Never resolves on the server.
 */
let settled: Promise<void> | undefined;

export function afterPageLoad(): Promise<void> {
  if (typeof window === 'undefined') return new Promise<void>(() => {});
  if (!settled) {
    settled = new Promise<void>((resolve) => {
      const whenIdle = () => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 2000 });
        else setTimeout(resolve, 200);
      };
      if (document.readyState === 'complete') whenIdle();
      else window.addEventListener('load', whenIdle, { once: true });
    });
  }
  return settled;
}
