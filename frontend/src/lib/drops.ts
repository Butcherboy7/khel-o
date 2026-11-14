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
  // Old blocks can carry a bad hour count; work it out from the clock times instead.
  const h = b.hours > 0 ? b.hours : (((minutesOf(b.endTime) - minutesOf(b.startTime)) % 1440) + 1440) % 1440 / 60;
  const hrs = Number.isInteger(h) ? h : h.toFixed(1);
  if (h >= 24) return `All 24 hours from ${clock(b.startTime)}`;
  const next = minutesOf(b.endTime) > 1440 ? ' next day' : '';
  return `${clock(b.startTime)} to ${clock(b.endTime)}${next}${h > 0 ? ` · ${hrs} ${h === 1 ? 'hour' : 'hours'}` : ''}`;
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

function bandAt(bands: TimePrice[] | undefined, m: number): TimePrice | null {
  m = ((m % 1440) + 1440) % 1440;
  for (const b of bands ?? []) {
    const s = minutesOf(b.start);
    let e = minutesOf(b.end);
    if (e <= s) e += 1440;
    if ((s <= m && m < e) || (s <= m + 1440 && m + 1440 < e)) return b;
  }
  return null;
}

function bandRate(d: Priced, m: number): number | null {
  return bandAt(d.timePrices, m)?.perHour ?? null;
}

/** Shortest booking (hours) that may start at minute m: set by the price window it starts in. */
export function minHoursAt(bands: TimePrice[] | undefined, m: number): number {
  return bandAt(bands, m)?.minHours ?? 1;
}

/** "5–6 AM ₹300 + 6–8 AM ₹400": what each part of a booking costs, for the price line. */
export function priceSplit(d: Priced, begin: number, hours: number): { from: number; to: number; perHour: number; amount: number }[] {
  const len = Math.round(hours * 60);
  const out: { from: number; to: number; perHour: number; amount: number }[] = [];
  for (let m = begin; m < begin + len; m += 30) {
    const rate = bandRate(d, m % 1440) ?? d.pricePerHour;
    const last = out[out.length - 1];
    if (last && last.perHour === rate && last.to === m) {
      last.to = m + 30;
      last.amount += rate / 2;
    } else out.push({ from: m, to: m + 30, perHour: rate, amount: rate / 2 });
  }
  return out;
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

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Put one price on [from, to) (minutes; past 1440 wraps to the next morning) over a date's
 *  existing windows: overlapped parts are replaced, the rest kept. perHour null = back to the
 *  usual price there. Returns windows sorted by start, neighbours with the same price merged. */
export function paintBands(bands: TimePrice[], from: number, to: number, perHour: number | null, minHours?: number): TimePrice[] {
  const cell: (TimePrice | null)[] = Array.from({ length: 48 }, () => null);
  for (const b of bands) {
    const s = minutesOf(b.start);
    let e = minutesOf(b.end);
    if (e <= s) e += 1440;
    for (let m = s; m < e; m += 30) cell[(m % 1440) / 30] = b;
  }
  const fresh = perHour ? { start: '', end: '', perHour, ...(minHours && minHours > 1 ? { minHours } : {}) } : null;
  for (let m = from; m < to; m += 30) cell[(m % 1440) / 30] = fresh;
  const out: TimePrice[] = [];
  let cur: { s: number; b: TimePrice } | null = null;
  const same = (a: TimePrice, b: TimePrice) => a.perHour === b.perHour && (a.minHours ?? 1) === (b.minHours ?? 1);
  const flush = (end: number) => {
    if (cur) out.push({ start: hm(cur.s), end: hm(end), perHour: cur.b.perHour, ...(cur.b.minHours ? { minHours: cur.b.minHours } : {}) });
    cur = null;
  };
  for (let i = 0; i < 48; i++) {
    const c = cell[i];
    if (cur && (!c || !same(cur.b, c))) flush(i * 30);
    if (c && !cur) cur = { s: i * 30, b: c };
  }
  flush(1440);
  // A window running through midnight is one window (11 PM to 2 AM), not two.
  if (out.length > 1 && out[0].start === '00:00' && out[out.length - 1].end === '00:00' && same(out[0], out[out.length - 1])) {
    const first = out.shift() as TimePrice;
    out[out.length - 1].end = first.end;
  }
  return out;
}
