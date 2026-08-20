'use client';

/**
 * TEMPORARY DIAGNOSTIC ROUTE — throwaway, delete after evidence is collected.
 *
 * Purpose: capture hard evidence for the iPhone "needs two taps" bug on the
 * booking CTA (reproduces in Chrome AND Brave on iOS, i.e. NOT Safari-specific
 * since all iOS browsers share WKWebView; does not reproduce on desktop or
 * desktop iPhone emulation).
 *
 * Three prior guesses have already shipped and failed:
 *   1. bottom-nav z-index / hideBottomNav
 *   2. framer-motion whileTap
 *   3. missing touch-action: manipulation
 *
 * This page does NOT fix anything. It only measures. It renders two buttons:
 *   - "Styled CTA": reproduces the real booking CTA's classes AND its fixed,
 *     backdrop-blurred, z-overlay sticky-bar container (copied from
 *     frontend/src/app/(customer)/bookings/new/page.tsx) so the instrument
 *     measures the same stacking/compositing situation, not a bare button.
 *   - "Plain control": same event logging, but no fixed positioning, no
 *     backdrop-blur — a plain block-level button in normal document flow.
 *
 * If the styled one needs two taps and the plain one does not, that isolates
 * the cause to the sticky/blurred container rather than to iOS touch
 * handling in general.
 *
 * Every pointerdown/up/cancel, touchstart/end, and click is logged with a
 * millisecond timestamp. On every pointerdown we also record
 * document.elementFromPoint() at the button's own center — the decisive
 * measurement for "is something invisible sitting on top of the button".
 *
 * A 3000ms interval counter is rendered in the same subtree to simulate the
 * real booking page's polling pressure (getCafeAvailability every 3s,
 * getCafe every 4s), to test the "re-render mid-gesture drops the
 * interaction" hypothesis.
 */

import { useEffect, useRef, useState } from 'react';

type LogEntry = {
  seq: number;
  label: string; // e.g. "styled: pointerdown"
  ts: number; // Date.now()
  detail?: string;
};

function useTapLogger(name: string, onLog: (entry: LogEntry) => void) {
  const seqRef = useRef(0);
  const [clicks, setClicks] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const log = (label: string, detail?: string) => {
    seqRef.current += 1;
    onLog({ seq: seqRef.current, label: `${name}: ${label}`, ts: Date.now(), detail });
  };

  const reportElementFromPoint = () => {
    const el = buttonRef.current;
    if (!el || typeof document === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) {
      log('elementFromPoint(center)', 'null (offscreen or covered by nothing renderable)');
      return;
    }
    const cls = (hit.className && typeof hit.className === 'string' ? hit.className : String(hit.className || '')).slice(0, 60);
    const isSelf = hit === el;
    log(
      'elementFromPoint(center)',
      `<${hit.tagName.toLowerCase()} class="${cls}"> — ${isSelf ? 'IS the button (OK)' : 'is NOT the button (possible overlay!)'}`
    );
  };

  const handlers = {
    ref: buttonRef,
    onPointerDown: () => {
      log('pointerdown');
      reportElementFromPoint();
    },
    onPointerUp: () => log('pointerup'),
    onPointerCancel: () => log('pointercancel', 'gesture likely stolen by scroll/browser chrome'),
    onTouchStart: () => log('touchstart'),
    onTouchEnd: () => log('touchend'),
    onClick: () => {
      log('CLICK');
      setClicks((c) => c + 1);
    },
  };

  return { handlers, clicks };
}

export default function TapDiagnosticPage() {
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [pollCount, setPollCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const addEvent = (entry: LogEntry) => {
    setEvents((prev) => [...prev, entry]);
  };

  // Simulates the real booking page's background polling pressure
  // (getCafeAvailability refetchInterval: 3000, getCafe refetchInterval: 4000)
  // so this subtree re-renders on the same cadence, to test whether a
  // re-render landing between pointerdown and click drops the gesture.
  useEffect(() => {
    const id = setInterval(() => setPollCount((c) => c + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const styled = useTapLogger('styled', addEvent);
  const plain = useTapLogger('plain', addEvent);

  const formatLog = () =>
    events
      .map((e) => `#${e.seq} @${e.ts}ms  ${e.label}${e.detail ? `  — ${e.detail}` : ''}`)
      .join('\n');

  const handleCopy = async () => {
    const text = formatLog() || '(no events yet)';
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied!');
    } catch {
      setCopyStatus('Copy failed — select text manually');
    }
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleClear = () => setEvents([]);

  return (
    <div className="min-h-screen bg-background text-text-primary pb-[420px]">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 p-4">
        <div>
          <h1 className="font-heading text-h2 font-bold">Tap Diagnostic (temporary)</h1>
          <p className="text-caption text-text-secondary mt-1">
            Throwaway instrumentation for the iPhone two-tap booking CTA bug. This page does not
            fix anything — it only records events. Tap each button once, then read the log below
            (or tap &quot;Copy log&quot; and paste it back).
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4">
          <p className="text-caption text-text-secondary">
            Background poll counter (simulates getCafe/getCafeAvailability refetchInterval, ticks
            every 3000ms — a re-render source in the real booking page):{' '}
            <span className="font-bold text-text-primary">{pollCount}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 flex flex-col gap-2">
          <h2 className="font-heading text-h3 font-bold">Control B — plain button</h2>
          <p className="text-caption text-text-secondary">
            No fixed positioning, no backdrop-blur, normal document flow. Same event logging as
            the styled CTA below. If this one needs only one tap while the styled one needs two,
            the sticky/blurred container is implicated, not iOS touch handling generally.
          </p>
          <button
            ref={plain.handlers.ref}
            type="button"
            onPointerDown={plain.handlers.onPointerDown}
            onPointerUp={plain.handlers.onPointerUp}
            onPointerCancel={plain.handlers.onPointerCancel}
            onTouchStart={plain.handlers.onTouchStart}
            onTouchEnd={plain.handlers.onTouchEnd}
            onClick={plain.handlers.onClick}
            className="rounded-2xl bg-secondary px-8 py-3.5 font-heading text-btn font-bold text-white shadow-float hover:bg-secondary/90 active:scale-[0.96] transition-all"
          >
            Plain Control CTA
          </button>
          <p className="text-caption font-bold">clicks: {plain.clicks}</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 flex flex-col gap-2">
          <h2 className="font-heading text-h3 font-bold">Control A — styled CTA (real context)</h2>
          <p className="text-caption text-text-secondary">
            This button lives in a fixed, sticky, backdrop-blurred bar identical in classes to
            the real &quot;Continue to Payment&quot; CTA — see the fixed bar pinned to the bottom
            of this page.
          </p>
          <p className="text-caption font-bold">clicks: {styled.clicks}</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-h3 font-bold">Event log ({events.length})</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-xl bg-primary px-4 py-2 text-caption font-bold text-white active:scale-[0.96] transition-all"
              >
                Copy log
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-xl bg-surface border border-border/80 px-4 py-2 text-caption font-bold text-text-primary active:scale-[0.96] transition-all"
              >
                Clear
              </button>
            </div>
          </div>
          {copyStatus && <p className="text-caption text-secondary font-bold">{copyStatus}</p>}
          <div className="rounded-xl bg-surface border border-border/50 p-3 max-h-[45vh] overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-caption text-text-secondary italic">No events yet. Tap a button above.</p>
            ) : (
              <ol className="flex flex-col gap-1.5 font-mono text-[13px] leading-tight">
                {events.map((e) => (
                  <li key={e.seq} className="whitespace-pre-wrap break-all">
                    <span className="text-text-secondary">#{e.seq} @{e.ts % 100000}ms</span>{' '}
                    <span className="font-bold">{e.label}</span>
                    {e.detail ? <span className="text-text-secondary"> — {e.detail}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 text-caption text-text-secondary">
          <p className="font-bold text-text-primary mb-1">How to test</p>
          <ol className="list-decimal list-inside flex flex-col gap-1">
            <li>Tap &quot;Clear&quot; to start with an empty log.</li>
            <li>Tap the styled CTA (fixed bar below) exactly once. Check &quot;clicks&quot; above it.</li>
            <li>Tap &quot;Copy log&quot; and paste the result somewhere you can send it back.</li>
            <li>Tap &quot;Clear&quot; again, then tap the plain control button once, and copy that log too.</li>
            <li>Repeat in Chrome, Brave, and Safari on the real iPhone.</li>
          </ol>
        </div>
      </div>

      {/* Fixed sticky bar — classes copied verbatim from the real booking CTA
          container in frontend/src/app/(customer)/bookings/new/page.tsx so this
          instrument measures the same stacking/compositing situation. */}
      <div className="fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-overlay bg-card/95 backdrop-blur-md border-t border-border/80 p-4 shadow-overlay">
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-caption text-text-secondary block truncate max-w-[200px] sm:max-w-none">
              Diagnostic sticky bar
            </span>
            <div className="font-heading text-h1 font-bold text-text-primary">
              clicks: {styled.clicks}
            </div>
          </div>

          <button
            ref={styled.handlers.ref}
            type="button"
            onPointerDown={styled.handlers.onPointerDown}
            onPointerUp={styled.handlers.onPointerUp}
            onPointerCancel={styled.handlers.onPointerCancel}
            onTouchStart={styled.handlers.onTouchStart}
            onTouchEnd={styled.handlers.onTouchEnd}
            onClick={styled.handlers.onClick}
            className="rounded-2xl bg-secondary px-8 sm:px-10 py-3.5 font-heading text-btn font-bold text-white shadow-float hover:bg-secondary/90 active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Styled CTA (tap me)
          </button>
        </div>
      </div>
    </div>
  );
}
