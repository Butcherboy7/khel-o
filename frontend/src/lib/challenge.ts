/** Small helpers shared by the challenge pages (public, player and admin). */

const IST = 'Asia/Kolkata';

/** "Sun 1 Nov" in India time, whatever the viewer's phone is set to. */
export function challengeDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
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
