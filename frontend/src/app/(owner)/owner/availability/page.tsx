'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Monitor,
  Joystick,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  Users,
  Clock3,
  Ban,
  QrCode,
  CalendarClock,
  Minus,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import {
  getOwnerAvailabilityTimeline,
  type OwnerAvailabilityTimeline,
  type AvailabilityTierSummary,
} from '@/lib/api/owner';
import { updateTier } from '@/lib/api/tiers';
import { getTodayString, formatMinutesTo12h, timeToMinutes } from '@/lib/format';
import { Card, Button, Badge } from '@/components/ui';

/* ── Helpers ─────────────────────────────────────────────────────── */

function platformIcon(platform: string | null) {
  return platform === 'pc' || !platform ? Monitor : Joystick;
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function OwnerAvailabilityPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [data, setData] = useState<OwnerAvailabilityTimeline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingBlocked, setIsUpdatingBlocked] = useState(false);

  const isToday = selectedDate === getTodayString();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getOwnerAvailabilityTimeline({
        date: selectedDate,
        tierId: selectedTierId || undefined,
      });
      setData(res);
      setSelectedTierId(res.selectedTierId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load availability.');
    } finally {
      setIsLoading(false);
    }
    // selectedTierId is intentionally excluded — switching tiers is driven by
    // the station-type buttons below, which set it and re-trigger this load
    // themselves; including it here would re-fire on every response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  // Whenever we land on a fresh day's data, snap the selected hour to "now"
  // (today) or the venue's first open hour (any other day).
  useEffect(() => {
    if (!data || data.timeline.length === 0) return;
    const nowHour = new Date().getHours();
    const inRange = data.timeline.some((s) => timeToMinutes(s.startTime) / 60 === nowHour);
    setSelectedHour(isToday && inRange ? nowHour : timeToMinutes(data.timeline[0].startTime) / 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.date, data?.selectedTierId]);

  const selectedTier: AvailabilityTierSummary | undefined = useMemo(
    () => data?.tiers.find((t) => t.id === data.selectedTierId),
    [data],
  );

  const selectedSlot = useMemo(() => {
    if (!data || selectedHour === null) return null;
    return data.timeline.find((s) => timeToMinutes(s.startTime) / 60 === selectedHour) || null;
  }, [data, selectedHour]);

  const slotBookings = useMemo(() => {
    if (!data || selectedHour === null) return [];
    const winStart = selectedHour * 60;
    const winEnd = winStart + 60;
    return data.bookings.filter((b) => {
      const bs = timeToMinutes(b.startTime);
      const be = timeToMinutes(b.endTime);
      return bs < winEnd && be > winStart;
    });
  }, [data, selectedHour]);

  const handleSelectTier = (tierId: string) => {
    if (tierId === selectedTierId) return;
    setSelectedTierId(tierId);
    (async () => {
      setIsLoading(true);
      try {
        const res = await getOwnerAvailabilityTimeline({ date: selectedDate, tierId });
        setData(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load availability.');
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const handleAdjustBlocked = async (delta: number) => {
    if (!data?.cafeId || !selectedTier) return;
    const currentBlocked = selectedTier.blockedSeats;
    const nextBlocked = Math.max(0, Math.min(selectedTier.totalSeats, currentBlocked + delta));
    const nextActive = selectedTier.totalSeats - nextBlocked;
    setIsUpdatingBlocked(true);
    try {
      await updateTier(data.cafeId, selectedTier.id, { activeSeatsCount: nextActive });
      await load();
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update blocked stations.');
    } finally {
      setIsUpdatingBlocked(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data || data.tiers.length === 0) {
    return (
      <div className="max-w-2xl mx-auto pt-10 px-4 text-center flex flex-col items-center gap-3">
        <Monitor className="h-10 w-10 text-text-tertiary" />
        <h1 className="font-heading text-h2 font-bold text-text-primary">No station types yet</h1>
        <p className="text-body text-text-secondary">
          Add a hardware tier (PC, PS5, Xbox...) before you can see live capacity here.
        </p>
        <Link href="/owner/tiers">
          <Button variant="primary" size="md">Set Up Hardware Tiers</Button>
        </Link>
      </div>
    );
  }

  const now = data.now;
  const heroStats = isToday && now
    ? { available: now.available, occupied: now.occupied, pending: now.pending, total: now.total }
    : selectedSlot
    ? { available: selectedSlot.available, occupied: selectedSlot.booked, pending: selectedSlot.pending, total: selectedSlot.total }
    : null;

  return (
    <div className="max-w-6xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="font-heading text-h2 sm:text-h1 font-bold text-text-primary">Live Availability</h1>
        <p className="text-caption text-text-secondary">See what&apos;s free &amp; manage your stations.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl text-caption font-semibold bg-red-500/10 border border-red-500/20 text-red-600">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Date bar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          className="h-11 w-11 rounded-xl border border-border bg-surface flex items-center justify-center hover:bg-surface-hover transition-colors flex-shrink-0"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-surface min-w-0">
          <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-heading text-caption font-bold text-text-primary truncate">{formatDateLabel(selectedDate)}</span>
        </div>

        <button
          type="button"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          className="h-11 w-11 rounded-xl border border-border bg-surface flex items-center justify-center hover:bg-surface-hover transition-colors flex-shrink-0"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {!isToday && (
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(getTodayString())} className="flex-shrink-0">
            Today
          </Button>
        )}
      </div>

      {/* Hero capacity strip */}
      {heroStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-1">
            <span className="text-overline text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Available {isToday ? 'Now' : ''}
            </span>
            <span className="font-heading text-h1 font-bold text-emerald-700">{heroStats.available}</span>
            <span className="text-xs text-emerald-700/70">of {heroStats.total}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col gap-1">
            <span className="text-overline text-rose-700 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Occupied {isToday ? 'Now' : ''}
            </span>
            <span className="font-heading text-h1 font-bold text-rose-700">{heroStats.occupied}</span>
            <span className="text-xs text-rose-700/70">of {heroStats.total}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-1">
            <span className="text-overline text-amber-700 flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" /> Pending
            </span>
            <span className="font-heading text-h1 font-bold text-amber-700">{heroStats.pending}</span>
            <span className="text-xs text-amber-700/70">booking{heroStats.pending === 1 ? '' : 's'}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-surface border border-border flex flex-col gap-1">
            <span className="text-overline text-text-secondary flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5" /> Total Stations
            </span>
            <span className="font-heading text-h1 font-bold text-text-primary">{heroStats.total}</span>
            <span className="text-xs text-text-tertiary">{selectedTier?.name}</span>
          </div>
        </div>
      )}

      {/* Station type selector */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-bold text-text-primary">Select Station Type</span>
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          {data.tiers.map((t) => {
            const Icon = platformIcon(t.platform);
            const isActive = t.id === data.selectedTierId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTier(t.id)}
                className={`flex flex-col items-center justify-center gap-1.5 min-w-[104px] px-3.5 py-3 rounded-2xl border-2 transition-colors flex-shrink-0 ${
                  isActive ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-hover'
                }`}
              >
                <Icon className={`h-6 w-6 ${isActive ? 'text-primary' : 'text-text-secondary'}`} />
                <span className={`text-caption font-bold text-center leading-tight ${isActive ? 'text-primary' : 'text-text-primary'}`}>
                  {t.name}
                </span>
                <span className="text-xs text-text-tertiary">{t.totalSeats} Stations</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability timeline */}
      <Card elevation="raised" className="p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-heading text-h3 font-bold text-text-primary">Availability Timeline</span>
          <div className="flex items-center gap-3 text-xs font-semibold text-text-secondary flex-wrap">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Booked</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pending</span>
            {selectedTier && selectedTier.blockedSeats > 0 && (
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Blocked</span>
            )}
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Hourly capacity">
          {data.timeline.map((slot) => {
            const hour = timeToMinutes(slot.startTime) / 60;
            const isSelected = hour === selectedHour;
            const isPast = isToday && hour < new Date().getHours();
            // Segment fill: proportion of the tier that's each state, stacked.
            const total = slot.total || 1;
            const availPct = (slot.available / total) * 100;
            const bookedPct = (slot.booked / total) * 100;
            const pendingPct = (slot.pending / total) * 100;
            const blockedPct = (slot.blocked / total) * 100;
            return (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => setSelectedHour(hour)}
                className={`flex flex-col items-center gap-1 flex-shrink-0 min-w-[46px] group ${isPast ? 'opacity-40' : ''}`}
                aria-label={`${formatMinutesTo12h(hour * 60)}: ${slot.available} of ${slot.total} available`}
                aria-pressed={isSelected}
              >
                <div
                  className={`w-full h-14 rounded-lg overflow-hidden flex flex-col-reverse border-2 transition-all ${
                    isSelected ? 'border-primary scale-105 shadow-md' : 'border-transparent group-hover:border-border'
                  }`}
                >
                  <div style={{ height: `${availPct}%` }} className="w-full bg-emerald-500" />
                  <div style={{ height: `${pendingPct}%` }} className="w-full bg-amber-500" />
                  <div style={{ height: `${bookedPct}%` }} className="w-full bg-rose-500" />
                  <div style={{ height: `${blockedPct}%` }} className="w-full bg-gray-400" />
                </div>
                <span className={`text-[10px] font-semibold ${isSelected ? 'text-primary' : 'text-text-tertiary'}`}>
                  {formatMinutesTo12h(hour * 60).replace(':00', '').replace(' ', '')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected-range readout */}
        {selectedSlot && (
          <div className="flex flex-col gap-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-heading text-body font-bold text-text-primary flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-primary" />
                {formatMinutesTo12h(timeToMinutes(selectedSlot.startTime))} – {formatMinutesTo12h(timeToMinutes(selectedSlot.endTime))}
              </span>
              {isToday && selectedHour === new Date().getHours() && (
                <Badge variant="primary" size="sm">Current Hour</Badge>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="flex flex-col">
                <span className="font-heading text-h2 font-bold text-emerald-600">{selectedSlot.available}</span>
                <span className="text-[10px] font-semibold text-text-tertiary uppercase">Available</span>
              </div>
              <div className="flex flex-col">
                <span className="font-heading text-h2 font-bold text-rose-600">{selectedSlot.booked}</span>
                <span className="text-[10px] font-semibold text-text-tertiary uppercase">Booked</span>
              </div>
              <div className="flex flex-col">
                <span className="font-heading text-h2 font-bold text-amber-600">{selectedSlot.pending}</span>
                <span className="text-[10px] font-semibold text-text-tertiary uppercase">Pending</span>
              </div>
              <div className="flex flex-col">
                <span className="font-heading text-h2 font-bold text-text-primary">{selectedSlot.total}</span>
                <span className="text-[10px] font-semibold text-text-tertiary uppercase">Total</span>
              </div>
            </div>

            <div className={`px-3.5 py-2.5 rounded-xl text-caption font-semibold flex items-center gap-2 ${
              selectedSlot.available > 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
            }`}>
              {selectedSlot.available > 0 ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
              <span>
                {selectedSlot.available > 0
                  ? `${selectedSlot.available} station${selectedSlot.available === 1 ? '' : 's'} free in this hour.`
                  : selectedSlot.blocked > 0
                  ? `Fully booked — ${selectedSlot.blocked} more blocked for maintenance.`
                  : 'Fully booked for this hour.'}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Drill-down: real bookings behind the selected hour */}
      {selectedSlot && (
        <Card elevation="resting" className="overflow-hidden">
          <div className="px-4 py-3.5 border-b border-border">
            <span className="font-heading text-body font-bold text-text-primary">
              What&apos;s Occupying This Hour {slotBookings.length > 0 && `(${slotBookings.length})`}
            </span>
          </div>
          {slotBookings.length === 0 ? (
            <div className="px-4 py-6 text-center text-caption text-text-secondary">
              No bookings overlap this hour on {selectedTier?.name}.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {slotBookings.map((b, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-data text-caption font-bold text-text-primary">
                      {formatMinutesTo12h(timeToMinutes(b.startTime))}–{formatMinutesTo12h(timeToMinutes(b.endTime))}
                    </span>
                    <span className="text-xs text-text-tertiary">{b.seatsCount} seat{b.seatsCount > 1 ? 's' : ''}</span>
                  </div>
                  <Badge
                    variant={b.status === 'pending_payment' ? 'warning' : 'success'}
                    size="sm"
                  >
                    {b.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Blocked / maintenance control */}
      {selectedTier && (
        <Card elevation="flat" className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gray-500/10 text-gray-500 flex items-center justify-center flex-shrink-0">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <span className="text-caption font-bold text-text-primary block">Blocked / Maintenance</span>
              <span className="text-xs text-text-tertiary">Stations taken out of service on {selectedTier.name}.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAdjustBlocked(-1)}
              disabled={isUpdatingBlocked || selectedTier.blockedSeats <= 0}
              className="h-9 w-9 rounded-lg bg-surface border border-border flex items-center justify-center hover:bg-surface-hover disabled:opacity-30 transition-colors"
            ><Minus className="h-3.5 w-3.5" /></button>
            <span className="font-heading text-body font-bold text-text-primary min-w-[2ch] text-center">{selectedTier.blockedSeats}</span>
            <button
              type="button"
              onClick={() => handleAdjustBlocked(1)}
              disabled={isUpdatingBlocked || selectedTier.blockedSeats >= selectedTier.totalSeats}
              className="h-9 w-9 rounded-lg bg-surface border border-border flex items-center justify-center hover:bg-surface-hover disabled:opacity-30 transition-colors"
            ><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/owner/scanner">
          <Button variant="primary" size="md" className="w-full gap-2 min-h-[48px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold">
            <QrCode className="h-4 w-4" /> Scan &amp; Check-in
          </Button>
        </Link>
        <Link href="/owner/bookings">
          <Button variant="outline" size="md" className="w-full gap-2 min-h-[48px]">
            <CalendarDays className="h-4 w-4" /> View Bookings
          </Button>
        </Link>
      </div>
    </div>
  );
}
