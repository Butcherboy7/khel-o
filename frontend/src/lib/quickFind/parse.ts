/**
 * Pulls the context out of what an owner types, so a flow can open already
 * filled in: "sell PS5 1 for 3 hours tomorrow" → machine PS5 #1, 3 hours,
 * tomorrow's date. Anything not said stays unset — nothing is guessed.
 */
import { normalize, tokens } from './text';

export type MachineKind = 'playstation' | 'xbox' | 'pc' | 'nintendo' | 'cabin' | 'table';

export interface ParsedMachine {
  kind: MachineKind;
  /** The model when one was said: "PS5 Pro", "PS5", "Series X". */
  model?: string;
  /** The machine's number: "PS5 2" → 2. */
  n?: number;
  /** How it was written, for titles ("PS5 2"). */
  text: string;
}

export interface ParsedDay {
  iso: string;
  /** "today", "tomorrow" or "Sat 21 Nov". */
  label: string;
  /** today / tomorrow, so links can say ?day=tomorrow instead of a date. */
  word?: 'today' | 'tomorrow';
}

export type BookingStatus = 'pending_payment' | 'confirmed' | 'checked_in' | 'active' | 'completed' | 'cancelled' | 'no_show';

export interface ParsedQuery {
  raw: string;
  norm: string;
  /** Every meaningful token, in order. */
  tokens: string[];
  /** Tokens left after dates, lengths and machine numbers were taken out — what the text match scores on. */
  free: string[];
  day?: ParsedDay;
  hours?: number;
  machine?: ParsedMachine;
  status?: BookingStatus;
  /** A booking reference such as GC-2026-A0R33G. */
  code?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ek: 1, do: 2, teen: 3, char: 4, paanch: 5 };

/** Today's date in India as YYYY-MM-DD (cafés run on IST whatever the device clock zone is). */
export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00+05:30`);
  return istToday(new Date(d.getTime() + n * 86_400_000));
}

export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'today';
  if (iso === addDaysIso(today, 1)) return 'tomorrow';
  if (iso === addDaysIso(today, -1)) return 'yesterday';
  return new Date(`${iso}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function makeDay(iso: string, today: string): ParsedDay {
  const word = iso === today ? 'today' : iso === addDaysIso(today, 1) ? 'tomorrow' : undefined;
  return { iso, label: dayLabel(iso, today), word };
}

/** Finds a day and returns it with the raw-string spans it used. */
function findDay(s: string, today: string): { day: ParsedDay; used: string[] } | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/\b(day after tomorrow|parso)\b/))) return { day: makeDay(addDaysIso(today, 2), today), used: m[1].split(' ') };
  if ((m = s.match(/\b(today|aaj|tonight)\b/))) return { day: makeDay(today, today), used: [m[1]] };
  if ((m = s.match(/\b(tomorrow|tmrw|tmr|kal)\b/))) return { day: makeDay(addDaysIso(today, 1), today), used: [m[1]] };
  if ((m = s.match(/\b(yesterday)\b/))) return { day: makeDay(addDaysIso(today, -1), today), used: [m[1]] };
  if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    return { day: makeDay(`${m[1]}-${m[2]}-${m[3]}`, today), used: [m[1], m[2], m[3]] };
  }
  const year = Number(today.slice(0, 4));
  const pick = (mo: number, d: number) => {
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    let iso = `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // "5 jan" said in November means next January.
    if (iso < addDaysIso(today, -60)) iso = `${year + 1}${iso.slice(4)}`;
    return iso;
  };
  if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/))) {
    const iso = pick(MONTHS.indexOf(m[2]), Number(m[1]));
    if (iso) return { day: makeDay(iso, today), used: [m[1], m[0].split(/\s+/).pop()!] };
  }
  if ((m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/))) {
    const iso = pick(MONTHS.indexOf(m[1]), Number(m[2]));
    if (iso) return { day: makeDay(iso, today), used: [m[0].split(/\s+/)[0], m[2]] };
  }
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/))) {
    const iso = pick(Number(m[2]) - 1, Number(m[1]));
    if (iso) return { day: makeDay(iso, today), used: [m[1], m[2]] };
  }
  const wd = s.match(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?\b/);
  if (wd) {
    const idx = WEEKDAYS.indexOf(wd[1].slice(0, 3));
    const todayIdx = new Date(`${today}T12:00:00+05:30`).getUTCDay();
    const ahead = (idx - todayIdx + 7) % 7;
    return { day: makeDay(addDaysIso(today, ahead), today), used: [wd[0]] };
  }
  return null;
}

function findHours(s: string): { hours: number; used: string[] } | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/\b(half an hour|half hour|30 ?min(?:s|utes)?)\b/))) return { hours: 0.5, used: m[1].split(' ') };
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|ghante|ghanta)\b/))) {
    const h = Number(m[1]);
    if (h > 0 && h <= 24) return { hours: h, used: [m[1], m[2]] };
  }
  if ((m = s.match(/\b(\d{2,3})\s*(m|min|mins|minute|minutes)\b/))) {
    const h = Number(m[1]) / 60;
    if (h > 0 && h <= 24) return { hours: Math.round(h * 2) / 2, used: [m[1], m[2]] };
  }
  if ((m = s.match(/\b(an|one|two|three|four|five|six|seven|eight|ek|do|teen|char|paanch)\s+(hour|hours|ghante|ghanta)\b/))) {
    return { hours: m[1] === 'an' ? 1 : NUMBER_WORDS[m[1]], used: [m[1], m[2]] };
  }
  return null;
}

const MACHINE_RE =
  /\b(ps5 pro|ps5pro|ps4 pro|ps5|ps4|playstation 5|playstation 4|playstation|xbox series x|xbox series s|series x|series s|xbox one|xbox|gaming pcs?|pcs?|computer|switch oled|switch|nintendo|cabin|table|snooker|pool)\b(?:\s*(?:#|no\.?|number)?\s*(\d{1,2})(?!\s*(?:h|hr|hrs|hour|hours|min|mins|minutes|ghante|ghanta)\b|\.\d|\/|\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)))?/;

function findMachine(s: string): ParsedMachine | null {
  const m = s.match(MACHINE_RE);
  if (!m) return null;
  const word = m[1];
  const n = m[2] ? Number(m[2]) : undefined;
  let kind: MachineKind;
  let model: string | undefined;
  if (/ps5 ?pro/.test(word)) { kind = 'playstation'; model = 'PS5 Pro'; }
  else if (/ps4 pro/.test(word)) { kind = 'playstation'; model = 'PS4 Pro'; }
  else if (/ps5|playstation 5/.test(word)) { kind = 'playstation'; model = 'PS5'; }
  else if (/ps4|playstation 4/.test(word)) { kind = 'playstation'; model = 'PS4'; }
  else if (word === 'playstation') kind = 'playstation';
  else if (/series x/.test(word)) { kind = 'xbox'; model = 'Series X'; }
  else if (/series s/.test(word)) { kind = 'xbox'; model = 'Series S'; }
  else if (/xbox one/.test(word)) { kind = 'xbox'; model = 'One'; }
  else if (word === 'xbox') kind = 'xbox';
  else if (/pc|computer/.test(word)) kind = 'pc';
  else if (/switch|nintendo/.test(word)) kind = 'nintendo';
  else if (word === 'cabin') kind = 'cabin';
  else kind = 'table';
  const shown = model ?? (kind === 'pc' ? 'PC' : kind === 'xbox' ? 'Xbox' : kind === 'playstation' ? 'PlayStation' : word.replace(/^\w/, (c) => c.toUpperCase()));
  return { kind, model, n, text: n ? `${shown} ${n}` : shown };
}

function findStatus(s: string): BookingStatus | undefined {
  if (/\b(no ?show|no shows|never (?:showed|came)|absent|didnt come)\b/.test(s)) return 'no_show';
  if (/\b(cancel+ed|cancellations?|refunds?|refunded)\b/.test(s)) return 'cancelled';
  if (/\b(unpaid|not paid|pending payments?|pending|payment pending|due)\b/.test(s)) return 'pending_payment';
  if (/\b(checked in|check ins)\b/.test(s)) return 'checked_in';
  if (/\b(playing now|in use|active)\b/.test(s)) return 'active';
  if (/\b(finished|completed|done|past)\b/.test(s)) return 'completed';
  return undefined;
}

export function parseQuery(raw: string, now: Date = new Date()): ParsedQuery {
  const today = istToday(now);
  // Keep dots and slashes for "1.5 hr" and "21/11"; everything else as normalize() does.
  const s = raw.toLowerCase().replace(/[’'`]s\b/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9./#₹-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const norm = normalize(raw);
  const all = tokens(raw);
  const used = new Set<string>();

  const code = raw.match(/\b(?:gc|kh|dr)-?\d{4}-?[a-z0-9]{4,8}\b/i)?.[0]?.toUpperCase();
  if (code) normalize(code).split(' ').forEach((t) => used.add(t));

  const dayHit = findDay(s, today);
  dayHit?.used.forEach((u) => normalize(u).split(' ').forEach((t) => used.add(t)));
  const hourHit = findHours(s);
  hourHit?.used.forEach((u) => normalize(u).split(' ').forEach((t) => used.add(t)));
  const machine = findMachine(s.replace(/-/g, ' ')) ?? undefined;
  if (machine?.n) used.add(String(machine.n));

  return {
    raw,
    norm,
    tokens: all,
    free: all.filter((t) => !used.has(t)),
    day: dayHit?.day,
    hours: hourHit?.hours,
    machine,
    status: findStatus(norm),
    code,
  };
}

/** Does a setup / console name fit the machine the owner typed? 2 = model fits too, 1 = kind only, 0 = no. */
export function machineFits(m: ParsedMachine, name: string, platform?: string | null): number {
  const n = normalize(name);
  const kindOf = (): MachineKind | null => {
    if (platform === 'playstation' || /\bps\d|playstation/.test(n)) return 'playstation';
    if (platform === 'xbox' || /xbox|series [xs]/.test(n)) return 'xbox';
    if (platform === 'pc' || /\bpcs?\b|computer|rtx|gaming pc/.test(n)) return 'pc';
    if (platform === 'nintendo' || /switch|nintendo/.test(n)) return 'nintendo';
    if (/cabin|room/.test(n)) return 'cabin';
    if (/table|snooker|pool/.test(n)) return 'table';
    return null;
  };
  if (kindOf() !== m.kind) return 0;
  if (!m.model) return 1;
  const model = normalize(m.model);
  // "PS5" said, "PS5 Pro" named: still the right kind of machine, a weaker fit.
  if (new RegExp(`\\b${model}\\b`).test(n)) {
    if (model === 'ps5' && /ps5 pro/.test(n)) return 1;
    return 2;
  }
  if (model === 'ps5' && /ps5pro/.test(n)) return 1;
  return 0;
}

/** The number at the end of a console label: "PS5 Pro 2" → 2. */
export function labelNumber(label: string): number | undefined {
  const m = label.match(/(\d{1,2})\s*$/);
  return m ? Number(m[1]) : undefined;
}

export const _testing = { findDay, findHours, findMachine, WEEKDAY_FULL };
