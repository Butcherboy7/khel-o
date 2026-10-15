import type { TierAttributes } from '@/types/taxonomy';

// Where an owner records "how many people fit on one unit", per activity.
// Mirrors backend taxonomy.players_cap. A unit's price never depends on group
// size; this only limits how many people can be booked onto it.
const CAP_KEYS = ['players_max', 'players_per_lane', 'room_capacity', 'players'] as const;

export function playersCapOf(attrs: TierAttributes | undefined | null): number | null {
  for (const k of CAP_KEYS) {
    const n = Number((attrs as Record<string, unknown> | undefined | null)?.[k]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/** What one bookable unit is called for this activity. */
export function unitNoun(taxonomyKey: string | null | undefined): { one: string; many: string } {
  const root = (taxonomyKey ?? '').split('.')[0];
  if (root === 'bowling') return { one: 'lane', many: 'lanes' };
  if (root === 'karaoke') return { one: 'room', many: 'rooms' };
  if (root === 'darts' || root === 'carrom') return { one: 'board', many: 'boards' };
  if (root === 'racing-simulator') return { one: 'rig', many: 'rigs' };
  if (['snooker', 'pool', 'billiards', 'carom', 'air-hockey', 'foosball', 'table-tennis'].includes(root)) {
    return { one: 'table', many: 'tables' };
  }
  return { one: 'unit', many: 'units' };
}
