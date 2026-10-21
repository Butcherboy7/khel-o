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

// React 19 shows streamed page content (everything behind a loading.tsx) up
// to 300 ms after the first paint, so on the home page the café list and its
// first photo appear after the load event. Until then each pending part
// still has its <template id="B:…"> placeholder in the document. Give up
// waiting after 3 s in case one never resolves.
const REVEAL_WAIT_MS = 3000;

function whenRevealed(done: () => void) {
  const deadline = performance.now() + REVEAL_WAIT_MS;
  const check = () => {
    if (!document.querySelector('template[id^="B:"]') || performance.now() > deadline) done();
    else setTimeout(check, 50);
  };
  check();
}

export function afterPageLoad(): Promise<void> {
  if (typeof window === 'undefined') return new Promise<void>(() => {});
  if (!settled) {
    settled = new Promise<void>((resolve) => {
      const whenIdle = () => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 2000 });
        else setTimeout(resolve, 200);
      };
      const afterLoad = () => whenRevealed(whenIdle);
      if (document.readyState === 'complete') afterLoad();
      else window.addEventListener('load', afterLoad, { once: true });
    });
  }
  return settled;
}
