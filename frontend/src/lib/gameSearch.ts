/**
 * Game search: "valorant", "gta 5", "marvel rivals" -> which cafés LIST that game.
 *
 * Only what a café's owner typed into "supported games" counts. We never guess
 * a game from PC / PS5: a wrong claim sends a gamer to the wrong café.
 */

export interface GameCafe {
  id: string;
  slug?: string | null;
  name: string;
  addressLine2?: string | null;
  city: string;
  isLeadListing?: boolean;
  /** Titles exactly as the owner typed them. */
  games: string[];
}

export interface GameMatch<C extends GameCafe = GameCafe> {
  game: string;
  cafes: C[];
}

/** Display title -> other ways people (and owners) write it. */
const CANON: { title: string; aliases: string[] }[] = [
  { title: 'GTA 6', aliases: ['gta6', 'gta vi', 'grand theft auto 6', 'grand theft auto vi'] },
  { title: 'GTA 5', aliases: ['gta5', 'gta v', 'gtav', 'gta v online', 'gta online', 'grand theft auto 5', 'grand theft auto v'] },
  { title: 'Valorant', aliases: ['valo'] },
  { title: 'Counter-Strike 2', aliases: ['cs2', 'cs 2', 'cs go', 'csgo', 'counter strike', 'counter strike 2', 'counter strike global offensive'] },
  { title: 'Marvel Rivals', aliases: ['marvels rivals'] },
  { title: 'Fortnite', aliases: [] },
  { title: 'Apex Legends', aliases: ['apex'] },
  { title: 'Tekken 8', aliases: ['tekken', 'tekken8'] },
  { title: 'EA FC', aliases: ['fifa', 'ea fc 24', 'ea fc 25', 'ea fc 26', 'fc 24', 'fc 25', 'fc 26', 'ea sports fc', 'fifa 23', 'fifa 24'] },
  { title: 'God of War', aliases: ['god of war ragnarok', 'gow'] },
  { title: 'Spider-Man 2', aliases: ['spiderman 2', 'marvels spider man 2', 'spider man'] },
  { title: 'Mortal Kombat', aliases: ['mortal kombat 1', 'mk1', 'mk11', 'mortal kombat 11'] },
  { title: 'Call of Duty', aliases: ['cod', 'warzone', 'call of duty warzone'] },
  { title: 'Minecraft', aliases: [] },
  { title: 'Rocket League', aliases: [] },
  { title: 'Dota 2', aliases: ['dota'] },
  { title: 'PUBG', aliases: ['battlegrounds', 'pubg battlegrounds'] },
  { title: 'Forza Horizon', aliases: ['forza', 'forza horizon 5'] },
  { title: 'Red Dead Redemption 2', aliases: ['rdr2', 'red dead'] },
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ALIAS_TO_TITLE = new Map<string, string>();
for (const g of CANON) {
  ALIAS_TO_TITLE.set(squash(g.title), g.title);
  for (const a of g.aliases) ALIAS_TO_TITLE.set(squash(a), g.title);
}

/** The one display title for any spelling ("GTA V Online" -> "GTA 5"). Unknown titles keep the owner's spelling. */
export function normalizeGame(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return ALIAS_TO_TITLE.get(squash(trimmed)) ?? trimmed;
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Every typed word starts a word of the text ("dg" matches "DG Gaming", not
 *  "Budget"), or the whole query does with spaces dropped, because phone
 *  keyboards turn "Rockstar" into "Rock star". */
export function startsWords(text: string, query: string): boolean {
  const qWords = words(query);
  if (qWords.length === 0) return false;
  const tWords = words(text);
  if (qWords.every((q) => tWords.some((t) => t.startsWith(q)))) return true;
  const compact = qWords.join('');
  return tWords.some((_, i) => tWords.slice(i).join('').startsWith(compact));
}

/** Does the typed text point at this game title? */
function queryMatchesGame(title: string, query: string): boolean {
  const aliases = CANON.find((g) => g.title === title)?.aliases ?? [];
  if (startsWords(`${title} ${aliases.join(' ')}`, query)) return true;
  // "gta5" / "cs2" typed without a space
  const q = squash(query);
  return q.length >= 2 && (squash(title).startsWith(q) || aliases.some((a) => squash(a).startsWith(q)));
}

/**
 * Games the typed text points at, each with the cafés that list it.
 * A game people know (the canon list) is returned even when no café lists it,
 * so the screen can say so. Unknown titles only appear when a café lists them.
 */
export function matchGames<C extends GameCafe>(query: string, cafes: C[]): GameMatch<C>[] {
  if (!query.trim()) return [];
  const byGame = new Map<string, C[]>();
  for (const g of CANON) byGame.set(g.title, []);
  for (const cafe of cafes) {
    for (const raw of cafe.games) {
      const title = normalizeGame(raw);
      const list = byGame.get(title) ?? [];
      if (!list.includes(cafe)) list.push(cafe);
      byGame.set(title, list);
    }
  }
  const out: GameMatch<C>[] = [];
  byGame.forEach((list, title) => {
    if (queryMatchesGame(title, query)) out.push({ game: title, cafes: list });
  });
  // Games that have cafés first, then the rest.
  return out.sort((a, b) => b.cafes.length - a.cafes.length);
}

/** Pages that exist for a game (not a café): the challenge and the GTA 6 drop. */
export function gamePage(game: string, challengeSlug: string): { title: string; subtitle: string; href: string; group: string } | null {
  if (game === 'Valorant') return { group: 'Happening', title: 'Valorant 5v5 Challenge', subtitle: 'Team of 5 · Sat 5 Dec · XQZ Hyderabad', href: `/challenge/${challengeSlug}` };
  if (game === 'GTA 6') return { group: 'Drops', title: 'GTA 6 Launch Drop', subtitle: 'Reserve your seat now · PS5 on a big screen', href: '/gta6' };
  return null;
}

/** Valorant search words also point at the challenge ("5v5", "challenge", "xqz"). */
export function challengeQueryMatches(query: string): boolean {
  return startsWords('valorant 5v5 5 v 5 challenge xqz team event competition', query);
}
