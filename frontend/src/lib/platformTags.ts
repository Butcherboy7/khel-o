// Single source of truth for deriving platform/hardware claims (café card
// badges, discovery filter tags) from a café's actual configured hardware
// tier names — never from the café's own name. Two separate ad-hoc
// implementations of "does this café have consoles" previously existed
// (CafeCard.tsx and the discovery page filter) and each had its own
// `cafe.name.toLowerCase().includes('velocity')`-style fallback, which is
// how a café could show "PS5 / Consoles" on its card with zero console
// tiers configured — the name matched a hardcoded substring, not real data.
export const CONSOLE_KEYWORDS = [
  'ps5', 'ps4', 'ps3', 'ps2', 'playstation',
  'xbox', 'switch', 'nintendo', 'dualsense', 'console',
];

export function hasConsoleTier(tierNames: string[] | undefined): boolean {
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
export function hasPcTier(tierNames: string[] | undefined): boolean {
  if (!tierNames || tierNames.length === 0) return true;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return !CONSOLE_KEYWORDS.some((kw) => lower.includes(kw));
  });
}
