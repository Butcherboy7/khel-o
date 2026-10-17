'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface BookingWelcomeProps {
  /** First name of the player, when known ("You're in, Rahul."). */
  firstName?: string | null;
  cafeName: string;
  /** "Sat, 17 Oct · 6:00 PM" */
  whenLabel: string;
  /** The booking's send-off line ("Player one, ready."). */
  sendOff?: string;
  onDone: () => void;
}

// Sparks leave the ring at these angles, in brand red, success green and the
// emblem gold, so the burst uses colours the app already speaks in.
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => ({
  angle,
  color: ['var(--primary)', 'var(--success)', '#F5A623'][i % 3],
}));

/**
 * Shown once, right after a payment goes through: a short welcome on the
 * dark pass colour, then it lifts away to the QR pass. Tap anywhere, press
 * Escape or wait ~2.6 s to carry on. Motion lives in globals.css
 * (khelo-welcome / khelo-ring / khelo-spark / khelo-rise).
 */
export function BookingWelcome({ firstName, cafeName, whenLabel, sendOff, onDone }: BookingWelcomeProps) {
  const [leaving, setLeaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // One short buzz on phones that support it, like a payment app's "done".
    if (!reduce) navigator.vibrate?.(35);
    const t = window.setTimeout(() => setLeaving(true), 2600);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLeaving(true);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => doneRef.current(), 240);
    return () => window.clearTimeout(t);
  }, [leaving]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-welcome-title"
      onClick={() => setLeaving(true)}
      className={cn(
        'fixed inset-0 z-[80] flex flex-col items-center justify-center bg-secondary px-6 pb-[env(safe-area-inset-bottom)] text-center text-white',
        leaving ? 'khelo-welcome-leaving' : 'khelo-welcome',
      )}
    >
      <svg width="120" height="120" viewBox="-12 -12 136 136" className="khelo-mark" aria-hidden>
        {SPARKS.map((s) => (
          <g key={s.angle} transform={`rotate(${s.angle} 56 56)`}>
            <line className="khelo-spark" x1="56" y1="0" x2="56" y2="-7" stroke={s.color} strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
        <circle cx="56" cy="56" r="44" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="6" />
        <circle
          className="khelo-ring"
          cx="56"
          cy="56"
          r="44"
          fill="none"
          stroke="var(--success)"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={1}
          transform="rotate(-90 56 56)"
        />
        <path
          className="khelo-check"
          d="M37 57.5 L50 70 L76 43"
          fill="none"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />
      </svg>

      <h2 id="booking-welcome-title" className="khelo-rise mt-6 font-heading text-h1 font-bold text-white" style={{ animationDelay: '0.6s' }}>
        You&apos;re in{firstName ? `, ${firstName}` : ''}.
      </h2>
      <p className="khelo-rise mt-2 max-w-xs text-body text-white/80" style={{ animationDelay: '0.7s' }}>
        {cafeName} · {whenLabel}
      </p>
      {sendOff && (
        <p className="khelo-rise mt-1 text-caption italic text-white/60" style={{ animationDelay: '0.78s' }}>
          {sendOff}
        </p>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setLeaving(true);
        }}
        className="khelo-rise mt-10 min-h-[48px] rounded-2xl bg-white px-6 font-heading text-btn font-bold text-secondary shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
        style={{ animationDelay: '0.95s' }}
      >
        Show my pass
      </button>
    </div>
  );
}
