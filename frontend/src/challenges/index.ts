import type { TeamChallengeConfig } from './types';
import { valorant3v3Xqz } from './valorant-5v5-xqz';

export type { TeamChallengeConfig } from './types';

/** Curated team challenges by slug. A new one = a new config file here. */
const TEAM_CHALLENGES: Record<string, TeamChallengeConfig> = {
  [valorant3v3Xqz.slug]: valorant3v3Xqz,
};

export function teamChallengeConfig(slug: string): TeamChallengeConfig | null {
  return TEAM_CHALLENGES[slug] ?? null;
}
