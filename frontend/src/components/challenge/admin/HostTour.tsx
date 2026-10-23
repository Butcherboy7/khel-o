'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

/** One stop of the host guide. `target` is a `data-host-tour` name on the
 *  page; without one (or when it isn't on screen) the bubble sits in the middle. */
export interface HostStep {
  target?: string;
  title: string;
  body: React.ReactNode;
  example?: React.ReactNode;
}

const KEY = (name: string) => `khelo.hostTour.${name}`;

function seen(name: string): boolean {
  try {
    return localStorage.getItem(KEY(name)) === 'done';
  } catch {
    return true;
  }
}

/** Opens the guide the first time a host sees the page (once `ready`), and
 *  stays closed after Finish or Skip. `start` replays it. */
export function useHostTour(name: string, ready: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (ready && !seen(name)) setOpen(true);
  }, [name, ready]);
  const close = useCallback(() => {
    try {
      localStorage.setItem(KEY(name), 'done');
    } catch {
      /* it just opens again next time */
    }
    setOpen(false);
  }, [name]);
  return { open, start: () => setOpen(true), close };
}

export function HostTutorialButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 text-caption font-semibold text-primary-dark hover:bg-primary/10"
    >
      <GraduationCap className="h-4 w-4" /> Tutorial
    </button>
  );
}

function isShown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function findTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-host-tour="${CSS.escape(name)}"]`)).filter(isShown);
  return all[all.length - 1] ?? null;
}

const PAD = 6;
const GAP = 14;
type Box = { top: number; left: number; width: number; height: number };

/** The host guide: the page goes dark except the part being explained, with
 *  Back / Next and Skip. It only explains; nothing on the page is pressed. */
export function HostTour({ steps, open, onClose }: { steps: HostStep[]; open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [bubbleH, setBubbleH] = useState(240);
  const [viewport, setViewport] = useState({ w: 390, h: 800 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = open ? steps[step] : undefined;
  const last = step === steps.length - 1;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Follow the explained part every frame (scrolling, refreshes, the phone turning).
  useEffect(() => {
    if (!current) return;
    setBox(null);
    let raf = 0;
    let scrolled = false;
    const loop = () => {
      const el = current.target ? findTarget(current.target) : null;
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const r = el.getBoundingClientRect();
          if (r.top < 64 || r.bottom > window.innerHeight - 96) {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ block: r.height > window.innerHeight * 0.5 ? 'start' : 'center', behavior: reduce ? 'auto' : 'smooth' });
          }
        }
        const r = el.getBoundingClientRect();
        // Tall parts (a long list) are cut to the screen so the bubble still fits.
        const top = Math.max(r.top, 8);
        const bottom = Math.min(r.bottom, window.innerHeight - 8);
        const next = { top, left: r.left, width: r.width, height: Math.max(0, bottom - top) };
        setBox((b) =>
          b && Math.abs(b.top - next.top) < 0.5 && Math.abs(b.left - next.left) < 0.5 && Math.abs(b.width - next.width) < 0.5 && Math.abs(b.height - next.height) < 0.5
            ? b
            : next,
        );
      } else {
        setBox(null);
      }
      setViewport((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [current]);

  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight);
  }, [step, box, viewport.w, open]);

  if (!current) return null;

  // Bubble below the lit part when it sits in the top half, above when in the
  // bottom half, pinned to the roomier edge when neither fits.
  const hole = box && box.height > 0
    ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
    : null;
  const width = Math.min(380, viewport.w - 24);
  let bubbleStyle: React.CSSProperties;
  if (hole) {
    const left = Math.min(Math.max(12, hole.left + hole.width / 2 - width / 2), viewport.w - width - 12);
    const below = hole.top + hole.height + GAP;
    const above = hole.top - GAP - bubbleH;
    const preferBelow = hole.top + hole.height / 2 < viewport.h / 2;
    const fitsBelow = below + bubbleH <= viewport.h - 12;
    const fitsAbove = above >= 12;
    const pinned = viewport.h - hole.top - hole.height >= hole.top ? viewport.h - bubbleH - 12 : 12;
    const top = preferBelow ? (fitsBelow ? below : fitsAbove ? above : pinned) : fitsAbove ? above : fitsBelow ? below : pinned;
    bubbleStyle = { top, left, width };
  } else {
    bubbleStyle = { top: Math.max(12, viewport.h / 2 - bubbleH / 2), left: (viewport.w - width) / 2, width };
  }

  return (
    <div className="fixed inset-0 z-[90]" data-host-tour-open>
      {hole ? (
        <>
          <div aria-hidden className="fixed inset-0" />
          <div
            aria-hidden
            className="khelo-tour-hole pointer-events-none fixed rounded-2xl"
            style={{ ...hole, boxShadow: '0 0 0 9999px rgb(24 25 30 / 0.74)' }}
          />
          <div aria-hidden className="khelo-tour-hole pointer-events-none fixed rounded-2xl ring-2 ring-primary" style={hole} />
        </>
      ) : (
        <div className="fixed inset-0 bg-secondary/75" aria-hidden />
      )}

      <button
        type="button"
        onClick={onClose}
        className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] min-h-[44px] rounded-full bg-black/55 px-4 text-caption font-semibold text-white backdrop-blur-sm hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip tutorial
      </button>

      <section
        ref={bubbleRef}
        key={step}
        role="dialog"
        aria-modal
        aria-labelledby="host-tour-title"
        className="fixed flex max-h-[min(78vh,36rem)] animate-fade-in-up flex-col gap-2 overflow-y-auto rounded-2xl bg-card p-4 shadow-float"
        style={bubbleStyle}
      >
        <div className="flex items-center justify-between gap-3 text-caption text-text-secondary">
          <span className="truncate font-semibold">Hosting a challenge</span>
          <span className="flex-shrink-0 tabular-nums">
            {step + 1} of {steps.length}
          </span>
        </div>
        <h2 id="host-tour-title" ref={headingRef} tabIndex={-1} className="font-heading text-h3 text-text-primary focus:outline-none">
          {current.title}
        </h2>
        <div className="flex flex-col gap-2 text-body text-text-primary">{current.body}</div>
        {current.example}
        <div className="mt-1 flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} className="gap-1">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" size="sm" onClick={() => (last ? onClose() : setStep(step + 1))} className="gap-1">
            {last ? 'Finish' : 'Next'}
            {!last && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** "Rohan vs Ronak" as it looks when entering a result. Only a picture. */
export function ResultExample({ winner, a = 2, b = 1, note }: { winner: 'a' | 'b'; a?: number; b?: number; note?: string }) {
  const row = (name: string, side: 'a' | 'b', games: number) => (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-10 flex-1 items-center truncate rounded-lg border px-3 text-caption font-semibold',
          winner === side ? 'border-success bg-success/10 text-success' : 'border-border text-text-primary',
        )}
      >
        {winner === side ? '🏆 ' : ''}
        {name}
      </span>
      <span className="flex h-10 w-12 items-center justify-center rounded-lg border border-border bg-surface text-caption tabular-nums text-text-primary">
        {games}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface/60 p-3" aria-label="Example">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Example · Semi-final · best of 3</p>
      {row('Rohan', 'a', a)}
      {row('Ronak', 'b', b)}
      {note && <p className="text-xs text-text-secondary">{note}</p>}
    </div>
  );
}
