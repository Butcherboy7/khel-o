// Booking intent persisted across a login/register round-trip — including a
// crash in between. A `?redirect=` query param already carries this in the
// happy path (see login/register pages), but it is lost if the app throws
// before/during that navigation (global-error.tsx) and the user reloads.
// localStorage survives both a crash and a reload, so it's the fallback of
// last resort.
//
// This is navigation intent ONLY. It is never treated as a source of truth
// for price, availability, or authorization — the backend revalidates
// everything when the booking is actually created.
const INTENT_KEY = 'khelo_booking_intent';
const INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface BookingIntent {
  cafeId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  seatsCount: number;
  tierId?: string;
  dayOffset: number;
  /** pathname + search of the booking wizard to return to after auth. */
  returnPath: string;
  savedAt: number;
}

export function saveBookingIntent(intent: Omit<BookingIntent, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, savedAt: Date.now() }));
  } catch {
    // localStorage unavailable (private mode / quota) — best-effort only,
    // never required for the booking itself.
  }
}

/**
 * Reads the stored intent, discarding (and clearing) anything expired or
 * malformed so a stale intent can never hijack a later, unrelated session.
 * `returnPath` is validated as a same-origin relative path only — never an
 * absolute URL — so a tampered localStorage value can't become an open
 * redirect.
 */
export function getBookingIntent(): BookingIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingIntent>;
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.returnPath !== 'string' ||
      typeof parsed.cafeId !== 'string'
    ) {
      localStorage.removeItem(INTENT_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > INTENT_TTL_MS) {
      localStorage.removeItem(INTENT_KEY);
      return null;
    }
    if (!parsed.returnPath.startsWith('/') || parsed.returnPath.startsWith('//')) {
      localStorage.removeItem(INTENT_KEY);
      return null;
    }
    return parsed as BookingIntent;
  } catch {
    return null;
  }
}

export function clearBookingIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(INTENT_KEY);
  } catch {
    // ignore
  }
}
