// Single source of truth for deriving platform/hardware claims (café card
// badges, discovery filter tags). Prefers real structured platform data
// (Owner Onboarding V2's `platforms` field on CafeListItem) when present;
// falls back to name-based keyword matching only for cafés that haven't
// been migrated yet (see PlatformReconfirmModal). This fallback is the
// same logic that caused BUG #3 — it now only ever applies to tiers
// nobody has confirmed a real platform for.
export const CONSOLE_KEYWORDS = [
  'ps5', 'ps4', 'ps3', 'ps2', 'playstation',
  'xbox', 'switch', 'nintendo', 'dualsense', 'console',
];

export function hasConsoleTier(tierNames: string[] | undefined, platforms?: string[]): boolean {
  if (platforms && platforms.length > 0) {
    return platforms.some((p) => p !== 'pc');
  }
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
export function hasPcTier(tierNames: string[] | undefined, platforms?: string[]): boolean {
  if (platforms && platforms.length > 0) {
    return platforms.includes('pc');
  }
  if (!tierNames || tierNames.length === 0) return true;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return !CONSOLE_KEYWORDS.some((kw) => lower.includes(kw));
  });
}
