// Single source of truth for deriving platform/hardware claims (café card
// badges, discovery filter tags). Prefers real structured platform data
// (Owner Onboarding V2's `platforms` field on CafeListItem) when present;
// falls back to name-based keyword matching only for cafés that haven't
// been migrated yet (see PlatformReconfirmModal). This fallback is the
// same logic that caused BUG #3 — it now only ever applies to tiers
// nobody has confirmed a real platform for.
//
// `platforms` is per-café but migration is per-tier (PlatformReconfirmModal
// confirms one tier at a time), so a café can have SOME real platforms and
// still have un-migrated tiers. `platformsComplete` (true only once every
// active tier has a confirmed platform) decides how much we trust the real
// column: once complete, it's authoritative and can correct a wrong
// name-based guess (e.g. remove a false console badge — BUG #3). Until then
// we union it with the name-based fallback, so a real confirmed platform can
// only ever ADD accuracy, never make an already-correct badge disappear —
// the spec's "never regresses below today's behavior" guarantee.
export const CONSOLE_KEYWORDS = [
  'ps5', 'ps4', 'ps3', 'ps2', 'playstation',
  'xbox', 'switch', 'nintendo', 'dualsense', 'console',
];

function nameBasedHasConsole(tierNames: string[] | undefined): boolean {
  if (!tierNames || tierNames.length === 0) return false;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return CONSOLE_KEYWORDS.some((kw) => lower.includes(kw));
  });
}

// A café's baseline offering is PC gaming stations; only suppress the "PC
// Gaming" claim when every configured tier is unambiguously a console tier.
// Cafés with no tier data yet default to showing it, same "assume true when
// unknown" fallback already used by isCafeOpenNow in lib/format.ts.
function nameBasedHasPc(tierNames: string[] | undefined): boolean {
  if (!tierNames || tierNames.length === 0) return true;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return !CONSOLE_KEYWORDS.some((kw) => lower.includes(kw));
  });
}

export function hasConsoleTier(tierNames: string[] | undefined, platforms?: string[], platformsComplete?: boolean): boolean {
  if (platforms && platforms.length > 0) {
    // 'other' is neither a console nor PC claim — it must not produce a
    // console badge on its own.
    const fromReal = platforms.some((p) => p !== 'pc' && p !== 'other');
    if (platformsComplete) return fromReal;
    return fromReal || nameBasedHasConsole(tierNames);
  }
  return nameBasedHasConsole(tierNames);
}

export function hasPcTier(tierNames: string[] | undefined, platforms?: string[], platformsComplete?: boolean): boolean {
  if (platforms && platforms.length > 0) {
    const fromReal = platforms.includes('pc');
    if (platformsComplete) return fromReal;
    return fromReal || nameBasedHasPc(tierNames);
  }
  return nameBasedHasPc(tierNames);
}

const PLAYSTATION_KEYWORDS = ['ps5', 'ps4', 'ps3', 'ps2', 'playstation', 'dualsense'];
const XBOX_KEYWORDS = ['xbox'];

function nameBasedHasKeyword(tierNames: string[] | undefined, keywords: string[]): boolean {
  if (!tierNames || tierNames.length === 0) return false;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  });
}

/** Same real-data-first, name-fallback pattern as hasConsoleTier/hasPcTier,
 *  narrowed to one specific console family for the discovery platform chips
 *  (PS5 / Xbox), which need to distinguish consoles from each other rather
 *  than just "has a console". */
export function hasPlatformTier(
  platform: 'playstation' | 'xbox',
  tierNames: string[] | undefined,
  platforms?: string[],
  platformsComplete?: boolean,
): boolean {
  const keywords = platform === 'playstation' ? PLAYSTATION_KEYWORDS : XBOX_KEYWORDS;
  if (platforms && platforms.length > 0) {
    const fromReal = platforms.includes(platform);
    if (platformsComplete) return fromReal;
    return fromReal || nameBasedHasKeyword(tierNames, keywords);
  }
  return nameBasedHasKeyword(tierNames, keywords);
}
