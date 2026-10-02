/**
 * Link-only campaign ("Founders' price") helpers. The reel link carries an
 * access code (?promoCode=DGFOUNDER). It is remembered per café for a while so
 * it survives browsing, a login round-trip, or reopening the link in a normal
 * browser; the server decides what it unlocks and when it is used up.
 */

const KEY = 'khelo_campaign_v1';
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredCampaign {
  code: string;
  cafeId: string | null;
  savedAt: number;
}

const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

/** "dgfounder " → "DGFOUNDER"; anything that can't be a code → null. */
export function normaliseCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function codeFromParams(get: (key: string) => string | null): string | null {
  return normaliseCode(get('promoCode') ?? get('code'));
}

export function readStoredCampaign(now: number = Date.now()): StoredCampaign | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCampaign;
    if (!parsed?.code || now - parsed.savedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeCampaign(code: string, cafeId: string | null): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ code, cafeId, savedAt: Date.now() }));
  } catch {
    /* private mode or blocked storage: the link itself still carries the code */
  }
}

export function clearStoredCampaign(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Instagram / Facebook / Messenger in-app browsers, where Google sign-in is often blocked. */
export function isInAppBrowser(userAgent: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(userAgent);
}

interface Spots {
  maxUses: number | null;
  claimed: number;
  remaining: number | null;
  full: boolean;
}

/** How many people claimed this campaign so far. Real numbers only: a small
 *  count is never shown, since "2 of 100 claimed" persuades nobody and a
 *  made-up one would be a lie. Until it is meaningful we state the true limit. */
export const SHOW_CLAIMED_FROM = 10;

export function spotsLine(c: Spots): string | null {
  if (c.maxUses == null) return null;
  if (c.full) return `All ${c.maxUses} spots are claimed`;
  if (c.claimed >= SHOW_CLAIMED_FROM) return `${c.claimed} of ${c.maxUses} claimed · ${c.remaining} left`;
  return `First ${c.maxUses} players only`;
}
