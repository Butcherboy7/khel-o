'use client';

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { AlertTriangle, Sparkles, Plus, Minus, Move } from 'lucide-react';
import {
  timeToMinutes,
  minutesToTimeAndDayOffset,
  formatMinutesTo12h,
  getTodayString,
  calculateWindowRemainingSeats,
} from '@/lib/format';

interface BookedSlot {
  startTime: string;
  endTime: string;
  seatsCount?: number;
}

interface AvailabilityBadge {
  remainingSeats?: number;
}

interface TimelineRangePickerProps {
  openingTime?: string;
  closingTime?: string;
  selectedDate: string;
  startTime: string;
  durationHours: number;
  // dayOffset: how many calendar days past `selectedDate` the emitted
  // startTime actually falls on (0 = same day, 1 = the overnight tail past
  // midnight). Callers must add this to selectedDate to get the effective
  // session date — see minutesToTimeAndDayOffset in lib/format.ts.
  onChange: (newStartTime: string, newDurationHours: number, dayOffset: number) => void;
  bookedSlots?: BookedSlot[];
  totalSeats?: number;
  requestedSeats?: number;
  remainingSeats?: number;
}

function formatPlayoTime(minutes: number): string {
  const totalHours = Math.floor(minutes / 60);
  const h24 = totalHours % 24;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12} ${ampm}`;
}

export function TimelineRangePicker({
  openingTime = '09:00:00',
  closingTime = '23:00:00',
  selectedDate,
  startTime,
  durationHours,
  onChange,
  bookedSlots = [],
  totalSeats = 10,
  requestedSeats = 1,
  remainingSeats,
}: TimelineRangePickerProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState(360);
  const isUserScrolling = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The programmatic smooth-scroll from centerSelectionInViewport fires the
  // same native 'scroll' event as user interaction, at intermediate
  // positions partway through its animation. Without this guard, that
  // motion gets misread as the user dragging the timeline and spuriously
  // calls onChange with whatever the mid-animation position decodes to
  // (typically the venue's opening time), silently overwriting the actual
  // selected slot on every mount.
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag interaction states
  const [dragMode, setDragMode] = useState<'start' | 'end' | 'pan' | null>(null);
  const dragStartX = useRef(0);
  const dragStartMin = useRef(0);
  const dragDurMin = useRef(0);

  // First-time coachmark: shown once per browser so a new customer knows the
  // triangles drag and the track swipes, then dismisses itself. Any real
  // interaction with the timeline (drag or scroll) also dismisses it early.
  const HINT_KEY = 'khelo_timeline_hint_seen';
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem(HINT_KEY)) {
      setShowHint(true);
      const timer = setTimeout(() => {
        setShowHint(false);
        window.localStorage.setItem(HINT_KEY, '1');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, []);
  const dismissHint = useCallback(() => {
    if (typeof window === 'undefined') return;
    setShowHint(false);
    window.localStorage.setItem(HINT_KEY, '1');
  }, []);

  // Measure container width
  useEffect(() => {
    if (!outerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(outerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Minute boundaries ─────────────────────────────────────────────────────
  const openMin = useMemo(() => timeToMinutes(openingTime), [openingTime]);
  const closeMin = useMemo(() => {
    let c = timeToMinutes(closingTime);
    if (c <= timeToMinutes(openingTime)) c += 1440;
    return c;
  }, [openingTime, closingTime]);

  const minValidStart = useMemo(() => {
    if (selectedDate === getTodayString()) {
      const now = new Date();
      const cur = now.getHours() * 60 + now.getMinutes();
      return Math.max(openMin, Math.ceil((cur + 10) / 30) * 30);
    }
    return openMin;
  }, [selectedDate, openMin]);

  // Current selection
  const selStart = useMemo(() => {
    let s = timeToMinutes(startTime);
    if (s < openMin) s += 1440;
    return Math.max(minValidStart, Math.min(closeMin - 30, s));
  }, [startTime, openMin, closeMin, minValidStart]);

  const durMin = Math.max(30, Math.round(durationHours * 60));
  const selEnd = Math.min(closeMin, selStart + durMin);

  // ── Dynamic Slot Width Scale (Compresses dynamically for large durations) ──
  const sidePadding = Math.max(40, containerWidth / 3);
  const maxAvailPx = Math.max(100, containerWidth - 64);
  const slotW = useMemo(() => {
    const numSlots = durMin / 30;
    const baseW = 42; // Sophisticated tight slot width (84px per hour)
    if (numSlots * baseW > maxAvailPx) {
      return Math.max(10, maxAvailPx / numSlots);
    }
    return baseW;
  }, [durMin, maxAvailPx]);

  const spanMin = closeMin - openMin;
  const trackWidthPx = (spanMin / 30) * slotW;

  const minToPx = useCallback(
    (m: number) => sidePadding + ((m - openMin) / 30) * slotW,
    [openMin, slotW, sidePadding]
  );

  const startPx = minToPx(selStart);
  const endPx = minToPx(selEnd);
  const rangePx = endPx - startPx;

  // ── Auto-Centering Scroll Helper ──────────────────────────────────────────
  const centerSelectionInViewport = useCallback(() => {
    if (!scrollRef.current) return;
    const selCenterPx = startPx + rangePx / 2;
    const targetScroll = Math.max(0, selCenterPx - containerWidth / 2);
    isProgrammaticScroll.current = true;
    scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 600);
  }, [startPx, rangePx, containerWidth]);

  // Auto-center on selection/duration changes
  useEffect(() => {
    if (!isUserScrolling.current && !dragMode) {
      centerSelectionInViewport();
    }
  }, [selStart, durMin, centerSelectionInViewport, dragMode]);

  // ── Sync scroll position to startTime when swiping dial ────────────────────
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || dragMode) return;
    if (isProgrammaticScroll.current) return;
    isUserScrolling.current = true;
    dismissHint();

    const centerViewPx = scrollRef.current.scrollLeft + containerWidth / 2;
    const startViewPx = centerViewPx - rangePx / 2;
    const rawMin = openMin + ((startViewPx - sidePadding) / slotW) * 30;
    const snappedMin = Math.round(rawMin / 30) * 30;
    const clampedMin = Math.max(minValidStart, Math.min(closeMin - durMin, snappedMin));

    if (clampedMin !== selStart) {
      const { time, dayOffset } = minutesToTimeAndDayOffset(clampedMin);
      onChange(time, durationHours, dayOffset);
    }

    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 200);
  }, [containerWidth, rangePx, openMin, sidePadding, slotW, minValidStart, closeMin, durMin, selStart, durationHours, onChange, dragMode, dismissHint]);

  // ── Drag & Handle Gesture Handlers ─────────────────────────────────────────
  const handlePointerDown = (mode: 'start' | 'end' | 'pan', e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dismissHint();
    setDragMode(mode);
    dragStartX.current = e.clientX;
    dragStartMin.current = selStart;
    dragDurMin.current = durMin;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode) return;
    const dx = e.clientX - dragStartX.current;
    const deltaMin = Math.round((dx / slotW) * 30 / 30) * 30;

    if (dragMode === 'start') {
      const newStart = Math.max(minValidStart, Math.min(selEnd - 30, dragStartMin.current + deltaMin));
      const newDur = Math.max(0.5, (selEnd - newStart) / 60);
      const startOffset = minutesToTimeAndDayOffset(newStart);
      onChange(startOffset.time, newDur, startOffset.dayOffset);
    } else if (dragMode === 'end') {
      const newEnd = Math.max(selStart + 30, Math.min(closeMin, dragStartMin.current + dragDurMin.current + deltaMin));
      const newDur = Math.max(0.5, (newEnd - selStart) / 60);
      const startOffset = minutesToTimeAndDayOffset(selStart);
      onChange(startOffset.time, newDur, startOffset.dayOffset);
    } else if (dragMode === 'pan') {
      const newStart = Math.max(minValidStart, Math.min(closeMin - dragDurMin.current, dragStartMin.current + deltaMin));
      const startOffset = minutesToTimeAndDayOffset(newStart);
      onChange(startOffset.time, durationHours, startOffset.dayOffset);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragMode) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      setDragMode(null);
      setTimeout(() => centerSelectionInViewport(), 50);
    }
  };

  // ── Availability Segments (Green = Available, Red = Booked, Grey = Past) ──
  const segments = useMemo(() => {
    const today = getTodayString();
    const nowMin =
      selectedDate === today
        ? new Date().getHours() * 60 + new Date().getMinutes()
        : -1;

    const list: { start: number; state: 'AVAILABLE' | 'BOOKED' | 'PAST' }[] = [];
    for (let m = openMin; m < closeMin; m += 30) {
      let state: 'AVAILABLE' | 'BOOKED' | 'PAST' = 'AVAILABLE';
      if (nowMin >= 0 && m + 30 <= nowMin) {
        state = 'PAST';
      } else {
        let totalOccupiedSeats = 0;
        for (const bs of bookedSlots) {
          let bS = timeToMinutes(bs.startTime);
          let bE = timeToMinutes(bs.endTime);
          if (bE <= bS) bE += 1440;
          if (m < bE && m + 30 > bS) {
            totalOccupiedSeats += bs.seatsCount || 1;
          }
        }
        if (totalOccupiedSeats + requestedSeats > totalSeats) {
          state = 'BOOKED';
        }
      }
      list.push({ start: m, state });
    }
    return list;
  }, [openMin, closeMin, selectedDate, bookedSlots, totalSeats, requestedSeats]);

  const isSelectionValid = useMemo(() => {
    if (selStart < minValidStart || selEnd > closeMin) return false;
    return segments
      .filter((s) => s.start >= selStart && s.start < selEnd)
      .every((s) => s.state === 'AVAILABLE');
  }, [selStart, selEnd, minValidStart, closeMin, segments]);

  const adjustDuration = (deltaHours: number) => {
    const newDur = Math.max(0.5, Math.min(16, durationHours + deltaHours));
    if (selStart + newDur * 60 <= closeMin) {
      const { time, dayOffset } = minutesToTimeAndDayOffset(selStart);
      onChange(time, newDur, dayOffset);
    }
  };

  const findNextSlot = () => {
    for (let m = minValidStart; m <= closeMin - 60; m += 30) {
      const ok1 = segments.find((s) => s.start === m)?.state === 'AVAILABLE';
      const ok2 = segments.find((s) => s.start === m + 30)?.state === 'AVAILABLE';
      if (ok1 && ok2) {
        isUserScrolling.current = false;
        const { time, dayOffset } = minutesToTimeAndDayOffset(m);
        onChange(time, 2, dayOffset);
        return;
      }
    }
  };

  const labelStepMinutes = slotW < 20 ? 120 : 60;

  // Calculate dynamic remaining seats for the currently selected time window (selStart to selEnd).
  // Shared with the seats-required stepper in the parent page via calculateWindowRemainingSeats
  // so the two can never show different numbers for the same selection.
  const activeWindowRemainingSeats = useMemo(
    () => calculateWindowRemainingSeats(totalSeats, bookedSlots, selStart, selEnd),
    [totalSeats, bookedSlots, selStart, selEnd]
  );

  const availabilityBadge = useMemo(() => {
    const seats = activeWindowRemainingSeats;
    if (seats === 0) return { text: 'Sold Out', variant: 'sold_out' as const };
    if (seats <= 2) return { text: `Last ${seats} seat${seats > 1 ? 's' : ''}!`, variant: 'critical' as const };
    if (seats <= 10) return { text: `Only ${seats} seats left!`, variant: 'warning' as const };
    return { text: `${seats} seats left`, variant: 'neutral' as const };
  }, [activeWindowRemainingSeats]);

  const ticks = useMemo(() => {
    const list: { minutes: number; label: string; showLabel: boolean; isHour: boolean }[] = [];
    for (let m = openMin; m <= closeMin; m += 30) {
      const isHour = m % 60 === 0;
      const showLabel = m % labelStepMinutes === 0;
      list.push({
        minutes: m,
        label: formatPlayoTime(m),
        showLabel,
        isHour,
      });
    }
    return list;
  }, [openMin, closeMin, labelStepMinutes]);

  return (
    <div className="flex flex-col gap-0 select-none">
      {/* ── Playo Header Bar (TIME + Duration Stepper) ── */}
      <div className="flex items-center justify-between rounded-t-3xl bg-[#e0f2fe]/75 p-3.5 border-b border-border/30">
        <div className="flex flex-col pl-1">
          <span className="text-[12px] font-extrabold tracking-wider text-text-primary uppercase">TIME</span>
          <span className="text-[13px] font-semibold text-text-secondary mt-0.5">
            {formatMinutesTo12h(selStart)} - {formatMinutesTo12h(selEnd)}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {availabilityBadge && (
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                availabilityBadge.variant === 'sold_out'
                  ? 'bg-gray-200 text-gray-600'
                  : availabilityBadge.variant === 'critical'
                  ? 'bg-red-100 text-red-700 animate-pulse'
                  : availabilityBadge.variant === 'warning'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {availabilityBadge.text}
            </span>
          )}

          <div className="flex items-center gap-2.5 bg-white rounded-2xl px-3 py-1.5 border border-border/60 shadow-sm">
            <button
              type="button"
              onClick={() => adjustDuration(-0.5)}
              disabled={durationHours <= 0.5}
              className="flex h-11 w-11 -m-1 items-center justify-center rounded-full text-text-primary hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="font-bold text-[13px] text-text-primary min-w-[65px] text-center">
              {durMin} Mins
            </span>
            <button
              type="button"
              onClick={() => adjustDuration(0.5)}
              disabled={selEnd + 30 > closeMin || durationHours >= 16}
              className="flex h-11 w-11 -m-1 items-center justify-center rounded-full text-text-primary hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Dynamic Timeline Canvas (100% Unified Coordinates) ── */}
      <div ref={outerRef} className="relative overflow-hidden bg-white pt-5 pb-3" style={{ height: 95 }}>
        {showHint && (
          <div
            className="absolute inset-x-3 top-1 z-30 flex items-start gap-2 rounded-xl bg-text-primary px-3 py-2 text-white shadow-lg"
            role="status"
          >
            <Move className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-white/80" />
            <p className="text-[11.5px] leading-snug font-medium">
              Drag the two dots to adjust your start &amp; end time — swipe the timeline left or right to see other hours.
            </p>
            <button
              type="button"
              onClick={dismissHint}
              className="ml-auto flex-shrink-0 text-white/60 hover:text-white text-[11px] font-bold px-1"
              aria-label="Dismiss hint"
            >
              ✕
            </button>
          </div>
        )}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-x-auto scrollbar-hide"
          // overscrollBehaviorX: without this, dragging near either edge of
          // this horizontal scroller gets misread by mobile Safari/Chrome as
          // the browser's own edge-swipe back/forward gesture, popping the
          // nav chrome up mid-drag.
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
        >
          <div
            style={{ width: trackWidthPx + sidePadding * 2, height: 95, position: 'relative' }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Playo Time Labels ("7 AM", "9 AM", "11 AM", "1 PM") */}
            {ticks.map(({ minutes, label, showLabel }) => {
              if (!showLabel) return null;
              return (
                <div
                  key={minutes}
                  style={{
                    position: 'absolute',
                    left: minToPx(minutes),
                    top: 10,
                    transform: 'translateX(-50%)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#374151',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  {label}
                </div>
              );
            })}

            {/* Vertical Tick Notch Lines */}
            {ticks.map(({ minutes, isHour }) => (
              <div
                key={minutes}
                style={{
                  position: 'absolute',
                  left: minToPx(minutes),
                  top: isHour ? 30 : 34,
                  width: isHour ? 1.5 : 1,
                  height: isHour ? 10 : 5,
                  backgroundColor: isHour ? '#6b7280' : '#d1d5db',
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* Baseline Track Line at y=42: Available / Booked / Past — each
                state also gets its own fill pattern (solid / diagonal hatch /
                dotted), not just a different color, so the state still reads
                for colorblind users or under bad sunlight glare. */}
            <div style={{ position: 'absolute', top: 42, left: sidePadding, width: trackWidthPx, height: 3 }}>
              {segments.map((seg) => {
                const x = ((seg.start - openMin) / 30) * slotW;
                let style: React.CSSProperties = {
                  backgroundColor: '#22c55e', // Available: solid green
                };
                if (seg.state === 'BOOKED') {
                  style = {
                    backgroundColor: '#ef4444',
                    backgroundImage:
                      'repeating-linear-gradient(135deg, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1.5px, transparent 0, transparent 4px)',
                  };
                } else if (seg.state === 'PAST') {
                  style = {
                    backgroundColor: '#d1d5db',
                    backgroundImage:
                      'repeating-linear-gradient(90deg, rgba(107,114,128,0.9) 0, rgba(107,114,128,0.9) 1.5px, transparent 0, transparent 5px)',
                  };
                }

                return (
                  <div
                    key={seg.start}
                    style={{
                      position: 'absolute',
                      left: x,
                      width: slotW,
                      top: 0,
                      height: 4,
                      borderRadius: 1,
                      ...style,
                    }}
                  />
                );
              })}
            </div>

            {/* GREYISH STRIPED SELECTION OVERLAY (Replaces green line for selected interval) */}
            <div
              onPointerDown={(e) => handlePointerDown('pan', e)}
              style={{
                position: 'absolute',
                left: startPx,
                width: rangePx,
                top: 40,
                height: 7,
                backgroundColor: '#ffffff',
                backgroundImage:
                  'repeating-linear-gradient(135deg, #374151 0, #374151 3px, #e5e7eb 0, #e5e7eb 7px)',
                borderRadius: 2,
                border: isSelectionValid ? '1px solid #374151' : '1px solid #ef4444',
                zIndex: 12,
                cursor: 'grab',
                touchAction: 'none',
              }}
            />

            {/* Left handle (Renders EXACTLY at startPx = minToPx(selStart)) — a 44px
                touch target wrapping a visible 26px thumb, so the tappable area meets
                the mobile minimum even though the visible dot stays small and precise. */}
            <div
              onPointerDown={(e) => handlePointerDown('start', e)}
              style={{
                position: 'absolute',
                left: startPx,
                top: 46,
                transform: 'translate(-50%, -50%)',
                zIndex: 20,
                cursor: 'ew-resize',
                touchAction: 'none',
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: `2.5px solid ${dragMode === 'start' ? '#2563eb' : '#374151'}`,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="8" height="10" viewBox="0 0 8 10">
                  <path d="M5.5 0v10M2.5 0v10" stroke={dragMode === 'start' ? '#2563eb' : '#374151'} strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Right handle (Renders EXACTLY at endPx = minToPx(selEnd)) */}
            <div
              onPointerDown={(e) => handlePointerDown('end', e)}
              style={{
                position: 'absolute',
                left: endPx,
                top: 46,
                transform: 'translate(-50%, -50%)',
                zIndex: 20,
                cursor: 'ew-resize',
                touchAction: 'none',
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: `2.5px solid ${dragMode === 'end' ? '#2563eb' : '#374151'}`,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="8" height="10" viewBox="0 0 8 10">
                  <path d="M5.5 0v10M2.5 0v10" stroke={dragMode === 'end' ? '#2563eb' : '#374151'} strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Thin Connecting Line between the two ▲ arrows */}
            <div
              style={{
                position: 'absolute',
                left: startPx,
                width: rangePx,
                top: 50,
                height: 1.5,
                backgroundColor: '#374151',
                zIndex: 15,
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Validation Warning & Recommendation Banner */}
      {!isSelectionValid && (
        <div className="mt-3 p-3.5 rounded-2xl bg-error/10 border border-error/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-caption text-error">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>This time overlaps with an existing booking or closed hours.</span>
          </div>
          <button
            type="button"
            onClick={findNextSlot}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-error text-white font-semibold text-caption hover:bg-error/90 transition-all flex-shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Find Open Slot
          </button>
        </div>
      )}
    </div>
  );
}
