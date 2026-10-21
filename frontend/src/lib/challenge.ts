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
