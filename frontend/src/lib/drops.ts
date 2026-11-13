import type { DropBlock } from '@/lib/api/drops';

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
