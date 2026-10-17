'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Pointer, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { PlayStep, TourTarget } from '@/lib/ownerTourCopy';
import { useTourRecord } from '@/hooks/useOwnerGuide';
import { useOwnerTourStore } from '@/store/ownerTourStore';

/** ₹150 worked through the way checkout does it (checkout_maths.py). */
function MoneyExample() {
  const rows: [string, string][] = [
    ['Your price for 1 hour', '₹150'],
    ['Customer sees', '₹149'],
    ['KHEL-O pays you the ₹1', '+₹1'],
    ['Booking fee (customer pays it, goes to KHEL-O)', 'not from you'],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface text-caption">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5">
          <span className="text-text-secondary">{label}</span>
          <span className="whitespace-nowrap font-semibold text-text-primary">{value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 bg-success/10 px-3 py-2">
        <span className="font-semibold text-text-primary">You get</span>
        <span className="font-heading text-body font-bold text-success">₹150</span>
      </div>
    </div>
  );
}

/** A pretend arrival to check in. Nothing is sent anywhere. */
function PracticeCheckIn({ done, onCheckIn }: { done: boolean; onCheckIn: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-card font-data text-caption font-bold text-text-primary">
          6:00
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
            Rahul
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Paid</span>
          </p>
          <p className="text-caption text-text-secondary">PS5 · 1 hr · ₹149</p>
        </div>
      </div>
      {done ? (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-caption font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden />
          Rahul is checked in. Give him his station.
        </p>
      ) : (
        <Button variant="primary" size="sm" fullWidth onClick={onCheckIn} className="mt-3 gap-1.5">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Check in
        </Button>
      )}
    </div>
  );
}

function isShown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** The element a step points at: the last visible match in page order, so the
 *  open menu drawer wins over the bottom bar and a phone's bar over the
 *  hidden desktop sidebar. */
function findTarget(target: TourTarget): HTMLElement | null {
  if (typeof target === 'string') {
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)).filter(isShown);
    return all[all.length - 1] ?? null;
  }
  const label = Array.from(document.querySelectorAll<HTMLLabelElement>('label')).filter(
    (l) => l.textContent?.trim() === target.label && isShown(l),
  );
  return (label[label.length - 1]?.parentElement as HTMLElement | undefined) ?? null;
}

const PAD = 6;
const GAP = 14;
/** How long a step waits for its button (page loading, a form opening). */
const WAIT_MS = 3000;
const WAIT_OPTIONAL_MS = 700;

type Box = { top: number; left: number; width: number; height: number };

/**
 * The owner Tutorial, Call-of-Duty-training style: the screen goes dark except
 * one real button, a hand points at it, and the lesson waits until that exact
 * button is tapped (or Skip). "Look" steps explain one thing with Next/Back.
 * Practice steps use a pretend customer; practice forms close without saving.
 * Mounted once in OwnerShell; opened by useOwnerTourAutoStart, Help & Support,
 * or a page's Tutorial button.
 */
export function OwnerTour() {
  const { open, mode, steps, step, goTo, close, setEnabled } = useOwnerTourStore();
  const { finished, skipped } = useTourRecord();
  const router = useRouter();
  const pathname = usePathname();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const tapped = useRef(false);
  const [box, setBox] = useState<Box | null>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(false);
  const [practiceDone, setPracticeDone] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [bubbleH, setBubbleH] = useState(220);
  const [viewport, setViewport] = useState({ w: 390, h: 800 });

  useEffect(() => {
    setEnabled(true);
    return () => setEnabled(false);
  }, [setEnabled]);

  const current: PlayStep | undefined = open ? steps[step] : undefined;
  const last = step === steps.length - 1;

  const finish = useCallback(() => {
    if (useOwnerTourStore.getState().mode === 'full') finished();
    close();
  }, [close, finished]);

  const advance = useCallback(() => {
    const s = useOwnerTourStore.getState();
    if (s.step >= s.steps.length - 1) finish();
    else s.goTo(s.step + 1);
  }, [finish]);

  const skip = () => {
    if (mode === 'full') skipped();
    close();
  };

  // Reset per step.
  useEffect(() => {
    setBox(null);
    setEl(null);
    setMissing(false);
    setPracticeDone(false);
    // A tap step starts a new chain ("Tap Edit"); the Cancel that closes the
    // form it opened belongs to that chain and keeps it.
    if (current?.kind === 'tap' && !current.afterTap) tapped.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Steps that only follow a real tap (the form it opened) are passed over
  // when that tap never happened.
  useEffect(() => {
    if (current?.afterTap && !tapped.current) advance();
  }, [current, advance]);

  // Open the page the step is on. A nav step whose page is already open
  // (the owner went there by hand) is done.
  useEffect(() => {
    if (!current || current.afterTap && !tapped.current) return;
    if (current.nav && typeof current.target === 'string' && current.target.startsWith('nav:')) {
      if (pathname === current.target.slice(4)) {
        tapped.current = true;
        advance();
      }
      return;
    }
    if (current.page !== '*' && pathname !== current.page) router.push(current.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, pathname]);

  // Find the step's button, bring it on screen, and follow it every frame
  // (scrolling, a sheet sliding in, the phone turning).
  useEffect(() => {
    if (!current || !current.target || (current.afterTap && !tapped.current)) return;
    const target = current.target;
    const started = performance.now();
    let found: HTMLElement | null = null;
    let raf = 0;
    let scrolled = false;
    const loop = () => {
      if (current.skipIfFound && performance.now() - started > 300 && findTarget(current.skipIfFound)) {
        advance();
        return;
      }
      if (!found || !found.isConnected || !isShown(found)) {
        found = current.page === '*' || pathname === current.page ? findTarget(target) : null;
        if (found) setEl(found);
      }
      if (found) {
        if (!scrolled) {
          scrolled = true;
          const r = found.getBoundingClientRect();
          // Inside a fixed bar or drawer: only scroll when it is cut off (a
          // long menu); on the page, keep it clear of the top and bottom bars.
          let fixed = false;
          for (let n: HTMLElement | null = found; n; n = n.parentElement) {
            if (getComputedStyle(n).position === 'fixed') { fixed = true; break; }
          }
          const off = fixed
            ? r.top < 0 || r.bottom > window.innerHeight
            : r.top < 64 || r.bottom > window.innerHeight - 96;
          if (off) {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            found.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
          }
        }
        const r = found.getBoundingClientRect();
        setBox((b) =>
          b && Math.abs(b.top - r.top) < 0.5 && Math.abs(b.left - r.left) < 0.5 && Math.abs(b.width - r.width) < 0.5 && Math.abs(b.height - r.height) < 0.5
            ? b
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
      } else {
        const waited = performance.now() - started;
        if (current.onlyIfVisible && waited > WAIT_OPTIONAL_MS) {
          advance();
          return;
        }
        if (waited > WAIT_MS) setMissing(true);
        setBox(null);
      }
      setViewport((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, pathname]);

  // A "tap" step moves on when that exact button is tapped; the app still
  // handles the tap (the link opens, the form appears).
  useEffect(() => {
    if (!el || current?.kind !== 'tap') return;
    const onClick = (e: MouseEvent) => {
      if (el.contains(e.target as Node)) {
        tapped.current = true;
        window.setTimeout(advance, 0);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [el, current, advance]);

  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  // The bubble's height decides whether it fits above or below the button.
  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight);
  }, [step, practiceDone, missing, box, viewport.w]);

  if (!current || (current.afterTap && !tapped.current)) return null;

  const hole = box && !missing
    ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
    : null;
  const tapStep = current.kind === 'tap' && !!hole;
  const waitingForTarget = !!current.target && !hole && !missing;

  // Bubble beside the hole: below it when the hole sits in the top half,
  // above when in the bottom half, pinned to an edge when neither fits.
  const width = Math.min(360, viewport.w - 24);
  let bubbleStyle: React.CSSProperties;
  if (hole) {
    const left = Math.min(Math.max(12, hole.left + hole.width / 2 - width / 2), viewport.w - width - 12);
    const below = hole.top + hole.height + GAP;
    const above = hole.top - GAP - bubbleH;
    const preferBelow = hole.top + hole.height / 2 < viewport.h / 2;
    const fitsBelow = below + bubbleH <= viewport.h - 12;
    const fitsAbove = above >= 12;
    // Neither side fits: pin to the edge with more room, covering as little
    // of the button as possible.
    const pinned = viewport.h - hole.top - hole.height >= hole.top ? viewport.h - bubbleH - 12 : 12;
    const top = preferBelow
      ? fitsBelow ? below : fitsAbove ? above : pinned
      : fitsAbove ? above : fitsBelow ? below : pinned;
    bubbleStyle = { top, left, width };
  } else {
    bubbleStyle = { top: Math.max(12, viewport.h / 2 - bubbleH / 2), left: (viewport.w - width) / 2, width };
  }

  // Back only to a "look" step on this same page: re-running a tap or a
  // page change backwards would undo what the owner just did.
  const prev = steps[step - 1];
  const canBack = !!prev && prev.kind === 'look' && !prev.nav && prev.page === current.page && current.kind === 'look';

  const blockers = hole
    ? [
        { top: 0, left: 0, width: viewport.w, height: Math.max(0, hole.top) },
        { top: hole.top + hole.height, left: 0, width: viewport.w, height: Math.max(0, viewport.h - hole.top - hole.height) },
        { top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height },
        { top: hole.top, left: hole.left + hole.width, width: Math.max(0, viewport.w - hole.left - hole.width), height: hole.height },
      ]
    : [];

  const label = mode === 'full' ? `Lesson ${current.lessonNo} of ${current.lessonCount} · ${current.lessonName}` : current.lessonName;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" data-owner-tour>
      {hole ? (
        <>
          {/* Taps outside the lit button land here and do nothing but nudge
              the bubble; on a "look" step the button itself is covered too. */}
          {blockers.map((b, i) => (
            <div key={i} className="pointer-events-auto fixed" style={b} onClick={() => setNudge((n) => n + 1)} aria-hidden />
          ))}
          {!tapStep && <div className="pointer-events-auto fixed" style={hole} onClick={() => setNudge((n) => n + 1)} aria-hidden />}
          <div
            aria-hidden
            className="khelo-tour-hole pointer-events-none fixed rounded-2xl"
            style={{ ...hole, boxShadow: '0 0 0 9999px rgb(24 25 30 / 0.74)' }}
          />
          <div
            aria-hidden
            className={cn('khelo-tour-hole pointer-events-none fixed rounded-2xl ring-2 ring-primary', tapStep && 'khelo-tour-ring')}
            style={hole}
          />
          {tapStep && (
            <Pointer
              aria-hidden
              className="khelo-tour-hand pointer-events-none fixed h-9 w-9 fill-white text-secondary drop-shadow-[0_2px_6px_rgb(0_0_0/0.45)]"
              style={{
                top: Math.min(hole.top + hole.height - 10, viewport.h - 44),
                left: Math.min(hole.left + hole.width / 2 + 4, viewport.w - 44),
              }}
            />
          )}
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0 bg-secondary/75" aria-hidden onClick={() => setNudge((n) => n + 1)} />
      )}

      <button
        type="button"
        onClick={skip}
        className="pointer-events-auto fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] min-h-[44px] rounded-full bg-black/55 px-4 text-caption font-semibold text-white backdrop-blur-sm hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip tutorial
      </button>

      {!waitingForTarget && (
        <section
          ref={bubbleRef}
          key={`${step}-${nudge}`}
          role="dialog"
          aria-modal={!tapStep}
          aria-labelledby="owner-tour-title"
          className={cn(
            'pointer-events-auto fixed flex max-h-[min(70vh,32rem)] flex-col gap-2 overflow-y-auto rounded-2xl bg-card p-4 shadow-float',
            nudge > 0 ? 'khelo-tour-nudge' : 'animate-fade-in-up',
          )}
          style={bubbleStyle}
        >
          <div className="flex items-center justify-between gap-3 text-caption text-text-secondary">
            <span className="truncate font-semibold">{label}</span>
            <span className="flex-shrink-0 tabular-nums">
              Step {current.stepNo} of {current.stepCount}
            </span>
          </div>
          <h2
            id="owner-tour-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-h3 text-text-primary focus:outline-none"
          >
            {current.title}
          </h2>
          <p className="text-body text-text-primary">{current.body}</p>
          {current.moneyExample && <MoneyExample />}
          {current.kind === 'practice' && (
            <PracticeCheckIn done={practiceDone} onCheckIn={() => setPracticeDone(true)} />
          )}
          {current.kind === 'practice' && (
            <p className="text-caption text-text-secondary">Practice only. Nothing is saved.</p>
          )}

          <div className="mt-1 flex items-center justify-between gap-2">
            {canBack ? (
              <Button variant="ghost" size="sm" onClick={() => goTo(step - 1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>
            ) : (
              <span />
            )}
            {tapStep ? (
              <span className="flex items-center gap-1.5 text-caption font-semibold text-primary-dark">
                <Pointer className="h-4 w-4" aria-hidden />
                Tap the lit-up button
              </span>
            ) : current.kind === 'practice' && !practiceDone ? null : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // A nav step whose button never showed: open the page for them.
                  if (current.kind === 'tap' && typeof current.target === 'string' && current.target.startsWith('nav:')) {
                    router.push(current.target.slice(4));
                  }
                  if (last) finish();
                  else advance();
                }}
                className="gap-1"
              >
                {last ? 'Finish' : 'Next'}
                {!last && <ArrowRight className="h-4 w-4" aria-hidden />}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
