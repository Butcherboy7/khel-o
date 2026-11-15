'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const ENTER_MS = 300;
const EXIT_MS = 190;
/** Drag further than this, or flick faster than FLICK px/ms, and the sheet closes. */
const CLOSE_AT = 96;
const FLICK = 0.55;

/**
 * The phone menu. It rises out of the bottom bar, where the More button is, and
 * goes back down: swipe it, tap outside, tap More again, press Escape or tap
 * the X. The bar stays on top of it (callers lift it with BAR_ABOVE_SHEET while
 * open), so a second tap on More can never land on something inside the sheet.
 * Phones only (lg:hidden); the desktop keeps its sidebar.
 */
export function NavSheet({
  open,
  onClose,
  label,
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** Sits under the grab handle and also drags the sheet. */
  header?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  // Callers pass inline arrows; keep the latest one without re-running effects.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setPortal(document.body), []);

  // Mount, then slide up on the next frame; slide down, then unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setDrag(0);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setMounted(false), reduce ? 0 : EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  // While open: no page scroll behind it, Escape closes, focus moves in and
  // comes back to the button that opened it.
  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const focus = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 30);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
      back.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Let buttons inside the header (the X) be tapped normally.
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dy = e.clientY - start.current.y;
    // Down follows the finger; up resists, so the sheet only stretches a little.
    setDrag(dy > 0 ? dy : -Math.min(24, Math.sqrt(-dy) * 3));
  }, []);

  const onUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!start.current || start.current.id !== e.pointerId) return;
      const dy = e.clientY - start.current.y;
      const v = dy / Math.max(1, performance.now() - start.current.t);
      start.current = null;
      setDragging(false);
      if (dy > CLOSE_AT || (dy > 12 && v > FLICK)) onClose();
      else setDrag(0);
    },
    [onClose],
  );

  if (!mounted || !portal) return null;

  const h = panelRef.current?.offsetHeight ?? 600;
  const y = shown ? Math.max(drag, -24) : h + 40;
  const fade = shown ? Math.max(0, 1 - Math.max(0, drag) / h) : 0;
  const ms = dragging ? 0 : shown ? ENTER_MS : EXIT_MS;
  const ease = shown ? 'cubic-bezier(0.32, 0.72, 0, 1)' : 'cubic-bezier(0.4, 0, 1, 1)';

  return createPortal(
    <div className="fixed inset-0 z-modal lg:hidden" data-nav-sheet>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-secondary/55 backdrop-blur-[2px] motion-reduce:transition-none"
        style={{ opacity: fade, transition: `opacity ${ms}ms ease` }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] mx-auto flex max-h-[calc(min(90dvh,800px)-var(--bottom-nav-height)-env(safe-area-inset-bottom,0px))] w-full max-w-lg flex-col rounded-t-[28px] bg-surface shadow-overlay outline-none motion-reduce:transition-none"
        style={{ transform: `translate3d(0, ${y}px, 0)`, transition: `transform ${ms}ms ${ease}` }}
      >
        <div
          className={cn('shrink-0 touch-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="flex justify-center pb-1 pt-2.5" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-text-tertiary/35" />
          </div>
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
      </div>
    </div>,
    portal,
  );
}

/** z-index for the bottom bar while the sheet is open: just above the sheet. */
export const BAR_ABOVE_SHEET = 'z-[61]';

/** True while the sheet is open and while it slides away, so the bar stays on
 *  top of it the whole time (and drops back under other dialogs after). */
export function useBarLifted(open: boolean): boolean {
  const [lifted, setLifted] = useState(open);
  useEffect(() => {
    if (open) {
      setLifted(true);
      return;
    }
    const t = window.setTimeout(() => setLifted(false), EXIT_MS + 40);
    return () => window.clearTimeout(t);
  }, [open]);
  return lifted;
}

/** Two-letter initials for the account card. */
export function initialsOf(name?: string | null, email?: string | null, fallback = 'K'): string {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? fallback;
}
