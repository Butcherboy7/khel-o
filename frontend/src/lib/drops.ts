import type { DropBlock, LengthPrice, TimePrice } from '@/lib/api/drops';

/** Display helpers for drops. Block dates and times are café time (IST). */

/** Session times can run past midnight: "26:00" is 2 AM the next morning. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** The moment `m` minutes after midnight (IST) on `date`; m can pass 1440 into the next day. */
export function atMinutes(date: string, m: number): Date {
  return new Date(new Date(`${date}T00:00:00+05:30`).getTime() + m * 60_000);
}

/** "26:00" → "02:00": the clock time the server expects. */
export function wireTime(hhmm: string): string {
  const m = minutesOf(hhmm) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function blockStart(b: Pick<DropBlock, 'date' | 'startTime'>): Date {
  return atMinutes(b.date, minutesOf(b.startTime));
}

export function blockEnd(b: Pick<DropBlock, 'date' | 'endTime'>): Date {
  return atMinutes(b.date, minutesOf(b.endTime));
}

/** The calendar date a time falls on: 12 AM (shown "24:00") of a session day is the next date. */
export function calDate(date: string, hhmm?: string | null): string {
  const days = hhmm ? Math.floor(minutesOf(hhmm) / 1440) : 0;
  if (!days) return date;
  return new Date(atMinutes(date, 0).getTime() + days * 86_400_000 + 12 * 3_600_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/** "18:00" → "6 PM", "18:30" → "6:30 PM". Past midnight "26:00" → "2 AM". */
export function clock(hhmm: string): string {
  const [rawH, m] = hhmm.split(':').map(Number);
  const h = rawH % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function blockTimes(b: Pick<DropBlock, 'startTime' | 'endTime' | 'hours'>): string {
  const hrs = Number.isInteger(b.hours) ? b.hours : b.hours.toFixed(1);
  if (b.hours >= 24) return `All 24 hours from ${clock(b.startTime)}`;
  const next = minutesOf(b.endTime) > 1440 ? ' next day' : '';
  return `${clock(b.startTime)} to ${clock(b.endTime)}${next} · ${hrs} ${b.hours === 1 ? 'hour' : 'hours'}`;
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function whenText(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/** The one name for the small amount paid online to hold a seat. Used on every screen. */
export const FEE = 'booking fee';
export const FEE_TITLE = 'Booking fee';

/** "GTA 6", "gta6" and "GTA VI" style spellings of one game all group together. */
export function gameKey(game: string): string {
  return game.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

type Listed = { slug: string; game: string; state: string };

/** Where a "play this game" banner should send people: straight to the drop when one
 *  café has it, or to the pick-your-café screen when several do. */
export function dropDestination<T extends Listed>(all: T[], game: string): { href: string; count: number } {
  const key = gameKey(game);
  const same = all.filter((d) => gameKey(d.game) === key && (d.state === 'open' || d.state === 'early'));
  if (same.length <= 1) return { href: `/drops/${(same[0] ?? all[0]).slug}`, count: same.length };
  return { href: `/drops?game=${encodeURIComponent(key)}`, count: same.length };
}

/** Straight-line distance in km between two map points. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "18:00" and "19:30" → "6 PM – 7:30 PM". */
export function clockRange(start: string, end: string): string {
  return `${clock(start)} – ${clock(end)}`;
}

/** "2026-11-19" → "19 Nov". */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

type Priced = { pricePerHour: number; maxHours: number | null; lengthPrices?: LengthPrice[]; timePrices?: TimePrice[] };

/** Hours people can book: the café's packages if it sells them, else 1..maxHours. */
export function dropLengths(d: Priced): number[] {
  if (d.lengthPrices?.length) return d.lengthPrices.map((p) => p.hours).sort((a, b) => a - b);
  return Array.from({ length: d.maxHours ?? 0 }, (_, i) => i + 1);
}

function bandRate(d: Priced, m: number): number | null {
  for (const b of d.timePrices ?? []) {
    const s = minutesOf(b.start);
    let e = minutesOf(b.end);
    if (e <= s) e += 1440;
    if ((s <= m && m < e) || (s <= m + 1440 && m + 1440 < e)) return b.perHour;
  }
  return null;
}

/** One seat for `hours` from minute `begin` of the session day. Mirrors seat_price in drop_service.py. */
export function dropSeatPrice(d: Priced, begin: number, hours: number): number {
  const len = Math.round(hours * 60);
  const pack = len % 60 === 0 ? d.lengthPrices?.find((p) => p.hours === len / 60) : undefined;
  let total = pack ? pack.price : (d.pricePerHour * len) / 60;
  for (let m = begin; m < begin + len; m += 30) {
    const r = bandRate(d, m % 1440);
    if (r != null) total += ((r - d.pricePerHour) * 30) / 60;
  }
  return Math.max(0, Math.round(total * 100) / 100);
}
