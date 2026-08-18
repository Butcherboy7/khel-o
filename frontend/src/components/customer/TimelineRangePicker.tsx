'use client';

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { AlertTriangle, Sparkles, Plus, Minus } from 'lucide-react';
import {
  timeToMinutes,
  minutesToTimeString,
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
  onChange: (newStartTime: string, newDurationHours: number) => void;
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

  // Drag interaction states
  const [dragMode, setDragMode] = useState<'start' | 'end' | 'pan' | null>(null);
  const dragStartX = useRef(0);
  const dragStartMin = useRef(0);
  const dragDurMin = useRef(0);

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
    scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
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
    isUserScrolling.current = true;

    const centerViewPx = scrollRef.current.scrollLeft + containerWidth / 2;
    const startViewPx = centerViewPx - rangePx / 2;
    const rawMin = openMin + ((startViewPx - sidePadding) / slotW) * 30;
    const snappedMin = Math.round(rawMin / 30) * 30;
    const clampedMin = Math.max(minValidStart, Math.min(closeMin - durMin, snappedMin));

    if (clampedMin !== selStart) {
      onChange(minutesToTimeString(clampedMin), durationHours);
    }

    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 200);
  }, [containerWidth, rangePx, openMin, sidePadding, slotW, minValidStart, closeMin, durMin, selStart, durationHours, onChange, dragMode]);

  // ── Drag & Handle Gesture Handlers ─────────────────────────────────────────
  const handlePointerDown = (mode: 'start' | 'end' | 'pan', e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
      onChange(minutesToTimeString(newStart), newDur);
    } else if (dragMode === 'end') {
      const newEnd = Math.max(selStart + 30, Math.min(closeMin, dragStartMin.current + dragDurMin.current + deltaMin));
      const newDur = Math.max(0.5, (newEnd - selStart) / 60);
      onChange(minutesToTimeString(selStart), newDur);
    } else if (dragMode === 'pan') {
      const newStart = Math.max(minValidStart, Math.min(closeMin - dragDurMin.current, dragStartMin.current + deltaMin));
      onChange(minutesToTimeString(newStart), durationHours);
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
      onChange(minutesToTimeString(selStart), newDur);
    }
  };

  const findNextSlot = () => {
    for (let m = minValidStart; m <= closeMin - 60; m += 30) {
      const ok1 = segments.find((s) => s.start === m)?.state === 'AVAILABLE';
      const ok2 = segments.find((s) => s.start === m + 30)?.state === 'AVAILABLE';
      if (ok1 && ok2) {
        isUserScrolling.current = false;
        onChange(minutesToTimeString(m), 2);
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
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-primary hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-primary hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Dynamic Timeline Canvas (100% Unified Coordinates) ── */}
      <div ref={outerRef} className="relative overflow-hidden bg-white pt-5 pb-3" style={{ height: 95 }}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-x-auto scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch' }}
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

            {/* Baseline Track Line at y=42: Green for Available, Red for Booked (Omitted for Selected Range) */}
            <div style={{ position: 'absolute', top: 42, left: sidePadding, width: trackWidthPx, height: 3 }}>
              {segments.map((seg) => {
                const x = ((seg.start - openMin) / 30) * slotW;
                // If segment is within selected range, hide the baseline green/red line so greyish striped bar replaces it
                let bgColor = '#22c55e'; // Green for Available
                if (seg.state === 'BOOKED') bgColor = '#ef4444'; // Red for Booked
                else if (seg.state === 'PAST') bgColor = '#d1d5db'; // Grey for Past

                return (
                  <div
                    key={seg.start}
                    style={{
                      position: 'absolute',
                      left: x,
                      width: slotW,
                      top: 0,
                      height: 4,
                      backgroundColor: bgColor,
                      borderRadius: 1,
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

            {/* Left ▲ Arrow (Renders EXACTLY at startPx = minToPx(selStart)) */}
            <div
              onPointerDown={(e) => handlePointerDown('start', e)}
              style={{
                position: 'absolute',
                left: startPx,
                top: 45,
                transform: 'translateX(-50%)',
                zIndex: 20,
                cursor: 'ew-resize',
                touchAction: 'none',
                padding: '4px',
              }}
            >
              <svg width="14" height="11" viewBox="0 0 14 11" style={{ display: 'block' }}>
                <path d="M7 0L14 11H0L7 0Z" fill="#374151" />
              </svg>
            </div>

            {/* Right ▲ Arrow (Renders EXACTLY at endPx = minToPx(selEnd)) */}
            <div
              onPointerDown={(e) => handlePointerDown('end', e)}
              style={{
                position: 'absolute',
                left: endPx,
                top: 45,
                transform: 'translateX(-50%)',
                zIndex: 20,
                cursor: 'ew-resize',
                touchAction: 'none',
                padding: '4px',
              }}
            >
              <svg width="14" height="11" viewBox="0 0 14 11" style={{ display: 'block' }}>
                <path d="M7 0L14 11H0L7 0Z" fill={dragMode === 'end' ? '#2563eb' : '#374151'} />
              </svg>
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
