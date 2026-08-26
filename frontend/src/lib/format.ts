// ── Date & Time Formatting ──────────────────────────────────────────────────

/** Format a session date string "YYYY-MM-DD" to human-readable "Sat, 2 Aug 2026" */
export function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format a session date string "YYYY-MM-DD" to short form "Sat, 2 Aug" */
export function formatSessionDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Format "HH:MM:SS" to "10:00 AM" */
export function formatTime(timeStr: string): string {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr ?? '00';
  const period = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${minutes} ${period}`;
}

/** Format duration hours to readable string: 1.5 → "1h 30m", 2 → "2h" */
export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Get next 14 dates from today as YYYY-MM-DD strings */
export function getNext14Days(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

/** Format a date string to day name + day number for the date strip */
export function formatDateStrip(dateStr: string): { day: string; date: number; isToday: boolean } {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return {
    day: d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase().slice(0, 3),
    date: d.getDate(),
    isToday,
  };
}

/** Format ISO datetime string to relative time "2 days ago", "just now" */
export function formatRelativeTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatSessionDateShort(date.toISOString().split('T')[0]);
}

// ── Currency Formatting ─────────────────────────────────────────────────────

/** Format a number as Indian Rupees: 1500 → "₹1,500" */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Format price per hour: 90 → "₹90/hr" */
export function formatPricePerHour(pricePerHour: number): string {
  return `₹${pricePerHour}/hr`;
}

/** Format a large currency number compactly: 116000 → "₹1.16L" */
export function formatCurrencyCompact(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return formatCurrency(amount);
}

// ── Booking Helpers ─────────────────────────────────────────────────────────

/** Calculate end time from start time and duration */
export function calcEndTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = h * 60 + (m ?? 0) + Math.round(durationHours * 60);
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
}

/** Generate time slot options for a café's operating hours.
 *  Handles overnight cafés: if closingHour <= openingHour,
 *  we treat closing as belonging to the next calendar day.
 *  e.g. open=10, close=02 → generates 10:00 … 23:30, 00:00, 01:30
 */
export function generateTimeSlots(openingTime: string, closingTime: string, _dateStr?: string): string[] {
  const slots: string[] = [];
  const [openH] = (openingTime ?? '09:00:00').split(':').map(Number);
  const rawCloseH = parseInt((closingTime ?? '23:00:00').split(':')[0], 10);

  const closeH = rawCloseH <= openH ? rawCloseH + 24 : rawCloseH;

  for (let h = openH; h < closeH; h++) {
    const displayH = h % 24;
    const hh = String(displayH).padStart(2, '0');
    slots.push(`${hh}:00:00`);
    if (h + 0.5 < closeH) {
      slots.push(`${hh}:30:00`);
    }
  }
  return slots;
}

/** Whether a café is open right now, given its opening/closing time strings.
 *  Handles overnight hours the same way generateTimeSlots does (closing
 *  hour <= opening hour means the café closes after midnight). Falls back
 *  to true (assume open) when hours are missing, since "unknown" is a
 *  worse UX default than a false "closed" for cafés that haven't set hours. */
export function isCafeOpenNow(openingTime?: string | null, closingTime?: string | null): boolean {
  if (!openingTime || !closingTime) return true;

  const [openH, openM] = openingTime.split(':').map(Number);
  const [rawCloseH, closeM] = closingTime.split(':').map(Number);

  const now = new Date();
  let nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = openH * 60 + (openM || 0);
  let closeMin = rawCloseH * 60 + (closeM || 0);

  if (closeMin <= openMin) {
    // Overnight: e.g. 10:00 open, 02:00 close means "closed" is only the
    // narrow window between 02:00 and 10:00 the same calendar morning.
    closeMin += 24 * 60;
    if (nowMin < openMin) nowMin += 24 * 60;
  }

  return nowMin >= openMin && nowMin < closeMin;
}

/** Check if a time slot is in the past (with 30min buffer) */
export function isSlotInPast(dateStr: string, timeStr: string, openingTimeStr?: string): boolean {
  const now = new Date();
  const slotDate = new Date(`${dateStr}T${timeStr}`);

  // If time slot hour is less than opening hour (e.g. 01:00 AM slot for a cafe opening at 10:00 AM),
  // it belongs to the next calendar day morning (overnight shift).
  if (openingTimeStr) {
    const [openH] = openingTimeStr.split(':').map(Number);
    const [slotH] = timeStr.split(':').map(Number);
    if (slotH < openH) {
      slotDate.setDate(slotDate.getDate() + 1);
    }
  }

  const buffer = 30 * 60 * 1000; // 30 minutes in ms
  return slotDate.getTime() - now.getTime() < buffer;
}

// ── String Helpers ──────────────────────────────────────────────────────────

/** Truncate a string to maxLen characters with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Get initials from a full name: "Arjun Singh" → "AS" */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Time Helpers ──────────────────────────────────────────────────────────

/** Convert "HH:MM:SS" to minutes since midnight */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

/** Convert minutes since midnight to "HH:MM:SS" format */
export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * Convert minutes since midnight of the *opening* day to a wall-clock
 * "HH:MM:SS" string plus how many calendar days past that opening day it
 * falls on. The timeline works in "minutes past midnight of the opening
 * day" space, so an overnight session's 00:30 slot is minute 1470 —
 * `minutesToTimeString` alone would silently wrap that to "00:30:00" via
 * `% 24`, losing the day boundary. Use this wherever `minutes` can exceed
 * 1440 (any post-midnight/overnight slot) so callers can advance the
 * booking's calendar date instead of losing the rollover.
 */
export function minutesToTimeAndDayOffset(minutes: number): { time: string; dayOffset: number } {
  return {
    time: minutesToTimeString(minutes),
    dayOffset: Math.floor(minutes / 1440),
  };
}

/** Add `days` (may be 0) to a "YYYY-MM-DD" date string, returning a new
 *  "YYYY-MM-DD" string. Used to turn a selected calendar day + a
 *  post-midnight day offset (see minutesToTimeAndDayOffset) into the
 *  effective session date actually submitted to the backend. */
export function addDaysToDateString(dateStr: string, days: number): string {
  if (!days) return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface BookedSlotLike {
  startTime: string;
  endTime: string;
  seatsCount?: number;
}

/**
 * Seats actually free for a specific start/end window, given the café's
 * total seat count and its currently booked slots. Single source of truth
 * shared by the booking timeline slider and the seats-required stepper —
 * they must never compute this independently or they'll drift out of sync.
 */
export function calculateWindowRemainingSeats(
  totalSeats: number,
  bookedSlots: BookedSlotLike[],
  windowStartMin: number,
  windowEndMin: number,
): number {
  let maxOccupied = 0;
  for (let m = windowStartMin; m < windowEndMin; m += 30) {
    let slotOccupied = 0;
    for (const bs of bookedSlots) {
      let bS = timeToMinutes(bs.startTime);
      let bE = timeToMinutes(bs.endTime);
      if (bE <= bS) bE += 1440;
      if (m < bE && m + 30 > bS) {
        slotOccupied += bs.seatsCount || 1;
      }
    }
    if (slotOccupied > maxOccupied) maxOccupied = slotOccupied;
  }
  return Math.max(0, totalSeats - maxOccupied);
}

/** Format minutes since midnight to 12-hour format "10:00 AM" */
export function formatMinutesTo12h(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Geolocation ──────────────────────────────────────────────────────────────

/** Great-circle distance in km between two lat/lng points (Haversine formula) */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Format a distance in km for display, e.g. "0.8 km" or "12 km" */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
