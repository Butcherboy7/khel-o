'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useGuidePulse } from '@/hooks/useOwnerGuide';

interface InfoTipProps {
  /** One or two plain-language lines explaining the thing it sits next to. */
  text: string;
  /** Which edge of the icon the popover lines up with; use 'end' near the right edge. */
  align?: 'start' | 'end';
  /** What the icon explains, for screen readers (“About bookings”). */
  label?: string;
  /** Customer-facing: never pulses and never touches the owner guide API. */
  quiet?: boolean;
  className?: string;
}

const POP_WIDTH = 256;
const EDGE = 8;
const GAP = 8;

/** The part of the screen the popover can be seen in: the viewport, cut down
 *  by every scrolling or clipping box it sits inside (a modal, a drawer). */
function visibleBounds(el: HTMLElement): { left: number; right: number } {
  let left = 0;
  let right = document.documentElement.clientWidth;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ox = getComputedStyle(p).overflowX;
    if (ox !== 'visible') {
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
    }
  }
  return { left, right };
}

/**
 * Tap-to-explain ⓘ for owner screens. Tap (not hover) because most owners are
 * on a phone. Pulses during the owner's first few sessions so they discover
 * help exists; a tapped icon stops pulsing since it's been found.
 */
export function InfoTip({ text, align = 'start', label = 'What is this?', quiet = false, className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState(false);
  const pulse = useGuidePulse(!quiet) && !found;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popId = useId();
  const popRef = useRef<HTMLSpanElement>(null);
  // Where the popover goes, in screen coordinates. It is drawn at the top of
  // the page (a portal), so a card that clips its contents (the checkout time
  // card) can't cut it off; it sits under the icon, or above it when the
  // screen has no room below, and never runs off a modal or the screen edge.
  const [place, setPlace] = useState<{ left: number; top: number; width: number; measured: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setPlace(null);
      return;
    }
    const wrap = wrapRef.current.getBoundingClientRect();
    const bounds = visibleBounds(wrapRef.current);
    const width = Math.max(140, Math.min(POP_WIDTH, bounds.right - bounds.left - EDGE * 2));
    const wanted = align === 'end' ? wrap.right - width : wrap.left;
    const left = Math.min(Math.max(wanted, bounds.left + EDGE), bounds.right - EDGE - width);
    setPlace({ left, top: wrap.bottom + GAP, width, measured: false });
  }, [open, align]);

  // Second pass, once the popover's height is known: flip above the icon if
  // it would run past the bottom of the screen (or under a fixed pay bar).
  useLayoutEffect(() => {
    if (!place || place.measured || !popRef.current || !wrapRef.current) return;
    const h = popRef.current.offsetHeight;
    const wrap = wrapRef.current.getBoundingClientRect();
    const below = wrap.bottom + GAP;
    const fitsBelow = below + h <= window.innerHeight - EDGE;
    const top = fitsBelow || wrap.top - GAP - h < EDGE ? below : wrap.top - GAP - h;
    setPlace({ ...place, top, measured: true });
  }, [place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Pinned to the screen, so it would drift off its icon on scroll: close instead.
    const onMove = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        onClick={(e) => {
          // Often sits inside a card that is itself a link — explain, don't navigate.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
          setFound(true);
        }}
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          pulse
            ? 'text-primary motion-safe:animate-guide-ring motion-reduce:ring-2 motion-reduce:ring-primary/30'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={popRef}
            id={popId}
            role="tooltip"
            className={cn(
              'fixed rounded-xl bg-secondary px-3 py-2.5',
              'text-caption font-medium normal-case tracking-normal text-white shadow-float text-left whitespace-normal'
            )}
            // Above modals and sheets too: it is always the thing just tapped.
            style={
              place
                ? { left: place.left, top: place.top, width: place.width, zIndex: 9999, visibility: place.measured ? 'visible' : 'hidden' }
                : { left: 0, top: 0, width: POP_WIDTH, zIndex: 9999, visibility: 'hidden' }
            }
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
