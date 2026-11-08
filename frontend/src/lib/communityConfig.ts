import { getPublicEnv } from '@/lib/runtimeEnv';

/** One line of the rotating "what you get" board on /community. The key word is shown in yellow. */
export interface ScoreItem {
  a: string;
  k: string;
  b: string;
}

/**
 * Two lines are switches. Set the env value to 0 on the server (and restart) to hide one:
 *   NEXT_PUBLIC_COMMUNITY_SHOW_OFFERS=0   hides "Member offers"
 *   NEXT_PUBLIC_COMMUNITY_SHOW_GTA6=0     hides "Book GTA 6 early"
 * Anything else, or unset, shows them.
 */
export function communityScoreboard(): ScoreItem[] {
  const on = (key: string) => getPublicEnv(key, '1') !== '0';
  const items: ScoreItem[] = [
    { a: '', k: 'Free', b: ' challenges.' },
    { a: 'Find ', k: 'teammates', b: '.' },
  ];
  if (on('NEXT_PUBLIC_COMMUNITY_SHOW_OFFERS')) items.push({ a: 'Member ', k: 'offers', b: '.' });
  if (on('NEXT_PUBLIC_COMMUNITY_SHOW_GTA6')) items.push({ a: 'Book ', k: 'GTA 6', b: ' early.' });
  return items;
}
