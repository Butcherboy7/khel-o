'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Lands the owner on the exact part of a page Quick Find sent them to.
 * A link with `?qf=pause` finds `[data-qf~="pause"]` (waiting for the page's
 * data to load), scrolls it to the middle of the screen, glows it twice, and
 * focuses its main field if it has one marked `data-qf-focus`. Then `qf` is
 * dropped from the address so a refresh doesn't replay it.
 */
export function QuickFindSpotlight() {
  const pathname = usePathname();
  const params = useSearchParams();
  const target = params.get('qf');

  useEffect(() => {
    if (!target || !/^[a-z0-9-]{1,32}$/.test(target)) return;
    let tries = 0;
    let timer = 0;

    const find = () => {
      // A page with tabs (a drop) opens the tab that holds this part.
      window.dispatchEvent(new CustomEvent('khelo:reveal', { detail: target }));
      const el = document.querySelector<HTMLElement>(`[data-qf~="${target}"]`);
      if (!el || el.offsetParent === null) {
        if (++tries < 40) timer = window.setTimeout(find, 125);
        return;
      }
      spotlightElement(el);

      const url = new URL(window.location.href);
      url.searchParams.delete('qf');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };
    timer = window.setTimeout(find, 60);
    return () => window.clearTimeout(timer);
  }, [target, pathname]);

  return null;
}

/** Scroll an element to the middle, glow it twice, focus its `data-qf-focus` field. */
export function spotlightElement(el: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Tall sections (a whole slot manager) start at the top, under the sticky header; short ones sit mid-screen.
  const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
  el.style.scrollMarginTop = '72px';
  el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.classList.remove('qf-spotlight');
  void el.offsetWidth;
  el.classList.add('qf-spotlight');
  // Never cleared early: the page may re-render (the link's params are dropped) mid-glow.
  window.setTimeout(() => el.classList.remove('qf-spotlight'), 2600);
  const field = el.matches('[data-qf-focus]') ? el : el.querySelector<HTMLElement>('[data-qf-focus]');
  if (field) window.setTimeout(() => field.focus({ preventScroll: true }), reduce ? 0 : 450);
}

/** After the page's own state changed, spotlight `[data-qf~=name]` once it renders. */
export function spotlightWhenReady(name: string, tries = 30) {
  const el = document.querySelector<HTMLElement>(`[data-qf~="${name}"]`);
  if (el && el.offsetParent !== null) spotlightElement(el);
  else if (tries > 0) window.setTimeout(() => spotlightWhenReady(name, tries - 1), 100);
}
