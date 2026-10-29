/** Small helpers shared by the challenge pages (public, player and admin). */

const IST = 'Asia/Kolkata';

/** "Sun 1 Nov" in India time, whatever the viewer's phone is set to. */
export function challengeDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** When it is, in words for a nudge: "today", "tomorrow", "this Sunday", "on Sunday" (India time). */
export function startsInWords(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d); // YYYY-MM-DD
  const diff = Math.round((Date.parse(day(new Date(iso))) - Date.parse(day(now))) / 86_400_000);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'long' }).format(new Date(iso));
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return diff <= 6 ? `this ${weekday}` : `on ${weekday}`;
}

/** "Sunday" in India time. */
export function challengeWeekday(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'long' }).format(new Date(iso));
}

/** "3 PM" or "2:30 PM" in India time. */
export function challengeTime(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const period = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toUpperCase();
  return `${hour}${minute === '00' ? '' : `:${minute}`} ${period}`;
}

/** "Sat 21 Nov, 11:59 PM IST": an exact moment, such as when a reward ends. */
export function challengeMoment(iso: string): string {
  return `${challengeDay(iso)}, ${challengeTime(iso)} IST`;
}

/** "3–6 PM" / "11 AM–2 PM". */
export function challengeTimeRange(startIso: string, endIso: string): string {
  const a = challengeTime(startIso);
  const b = challengeTime(endIso);
  const [aTime, aPeriod] = a.split(' ');
  const [, bPeriod] = b.split(' ');
  return aPeriod === bPeriod ? `${aTime}–${b}` : `${a}–${b}`;
}

/** wa.me link with a message ready to send. `phone` is "+919876543210". */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** "@khelo.journey" from "khelo.journey" or "@khelo.journey". */
export function handle(h: string | null | undefined): string | null {
  const clean = (h ?? '').trim().replace(/^@/, '');
  return clean ? `@${clean}` : null;
}

const UTM_KEY = 'khelo_challenge_utm';
export interface ChallengeUtm {
  utmSource?: string;
  utmCampaign?: string;
  utmContent?: string;
}

/** The /c/<name> short link adds utm tags to the URL. Keep them for this tab,
 *  so they survive the trip through sign-in. */
export function rememberUtm(search: string): void {
  const q = new URLSearchParams(search);
  const pick = (k: string) => q.get(k)?.slice(0, 80) || undefined;
  const utm: ChallengeUtm = { utmSource: pick('utm_source'), utmCampaign: pick('utm_campaign'), utmContent: pick('utm_content') };
  if (!utm.utmSource) return;
  try {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch {
    /* private mode: the URL still carries them */
  }
}

export function recalledUtm(search: string): ChallengeUtm {
  rememberUtm(search);
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as ChallengeUtm) : {};
  } catch {
    return {};
  }
}

/** Roughly how long one match takes, including sitting down and picking
 *  characters: about 8 min for best of 3, 13 min for best of 5. */
export function matchMinutes(bestOf: number): number {
  return Math.round(bestOf * 2.5 + 0.5);
}

export interface ChallengePlan {
  players: number;
  rounds: number;
  /** Matches actually played (byes don't count), 3rd-place match included. */
  matches: number;
  minutes: number;
}

/** The knockout for `players` people: rounds, matches and a rough time with
 *  `setups` matches running at once. The 3rd-place match and the final are
 *  played one after the other at the end. Only an estimate. */
export function challengePlan(players: number, bestOf: number, finalBestOf: number, setups: number): ChallengePlan | null {
  if (players < 2) return null;
  const size = 2 ** Math.ceil(Math.log2(players));
  const rounds = Math.log2(size);
  const each = matchMinutes(bestOf);
  const lanes = Math.max(1, Math.floor(setups) || 1);
  let matches = 0;
  let minutes = 0;
  for (let r = 0; r < rounds - 1; r += 1) {
    // Round 1 only has the matches that aren't byes; later rounds are full.
    const n = r === 0 ? players - size / 2 : size / 2 ** (r + 1);
    matches += n;
    minutes += Math.ceil(n / lanes) * each;
  }
  // With 3 players the lone semi-final loser takes 3rd without playing.
  const third = players >= 4 ? 1 : 0;
  matches += 1 + third;
  minutes += matchMinutes(finalBestOf) + third * each;
  return { players, rounds, matches, minutes };
}

/** "1 h 40 min" / "45 min". */
export function hoursAndMinutes(total: number): string {
  const rounded = Math.max(5, Math.round(total / 5) * 5);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** The challenge the home page and /community point people to. Its link is
 *  printed on reels and posters, so it never changes. */
export const FEATURED_CHALLENGE_SLUG = 'tekken-01';

/** KHEL-O's WhatsApp community invite (Announcements, Lobby, Challengers). */
export const COMMUNITY_URL = 'https://chat.whatsapp.com/FWVq1Iv7EgaDlyspNkS3ps';

/** A challenge with no real cap (the host just sets a very high number): everyone who signs up and
 *  comes to check-in plays, so the pages talk about "everyone" instead of counting spots. */
export function openToAll(capacity: number): boolean {
  return capacity >= 100;
}

/** Still worth showing: open for sign-ups, or closed/live but not over. */
export function isUpcoming(c: { status: string; endsAt: string }): boolean {
  return ['open', 'closed', 'live'].includes(c.status) && new Date(c.endsAt).getTime() > Date.now();
}

/** A WhatsApp share with no number: the person picks who to send it to. */
export function whatsappShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Cookie the server reads so the challenge intro plays once per device per challenge. */
export function introCookie(slug: string): string {
  return `khelo_intro_${slug.replace(/[^a-z0-9-]/gi, '')}`;
}
