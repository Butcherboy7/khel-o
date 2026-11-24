import { describe, expect, it } from 'vitest';
import { matchGames, normalizeGame, startsWords, type GameCafe } from './gameSearch';

const cafe = (id: string, name: string, games: string[]): GameCafe => ({ id, name, city: 'Hyderabad', games });
const cafes = [
  cafe('a', 'XQZ Hyderabad', ['Valorant', 'Counter-Strike 2']),
  cafe('b', 'Rockstar Gaming Cafe', ['GTA V', 'Marvel rivals']),
  cafe('c', 'Wild Gaming Cafe', ['GTA5', 'CS2']),
  cafe('d', 'DG Gaming Cafe', ['GTA V Online']),
];

describe('normalizeGame', () => {
  it('maps every spelling of GTA 5 to one title', () => {
    for (const s of ['GTA 5', 'GTA5', 'GTA V', 'gta v online', 'GTAV']) expect(normalizeGame(s)).toBe('GTA 5');
  });
  it('maps CS spellings and keeps unknown titles as typed', () => {
    expect(normalizeGame('CS2')).toBe('Counter-Strike 2');
    expect(normalizeGame('Counter-Strike 2')).toBe('Counter-Strike 2');
    expect(normalizeGame('Marvel rivals')).toBe('Marvel Rivals');
    expect(normalizeGame('  Some New  Game ')).toBe('Some New Game');
  });
});

describe('matchGames', () => {
  it('finds the cafés that list Valorant', () => {
    const m = matchGames('valorant', cafes);
    expect(m).toHaveLength(1);
    expect(m[0].game).toBe('Valorant');
    expect(m[0].cafes.map((c) => c.name)).toEqual(['XQZ Hyderabad']);
  });
  it('groups every spelling of GTA 5 together, with or without a space', () => {
    for (const q of ['gta 5', 'gta5', 'gta v']) {
      const m = matchGames(q, cafes).find((x) => x.game === 'GTA 5');
      expect(m?.cafes.map((c) => c.id).sort()).toEqual(['b', 'c', 'd']);
    }
  });
  it('matches by prefix and by CS shorthand', () => {
    expect(matchGames('marv', cafes)[0].cafes.map((c) => c.id)).toEqual(['b']);
    expect(matchGames('cs2', cafes).find((x) => x.game === 'Counter-Strike 2')?.cafes.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });
  it('still returns a known game when no café lists it, with an empty list', () => {
    const m = matchGames('fortnite', cafes);
    expect(m).toEqual([{ game: 'Fortnite', cafes: [] }]);
  });
  it('never guesses from the platform: a café with no listed games is never returned', () => {
    expect(matchGames('gta 6', cafes).every((m) => m.cafes.length === 0)).toBe(true);
  });
  it('returns nothing for an empty or unrelated query', () => {
    expect(matchGames('', cafes)).toEqual([]);
    expect(matchGames('zzzz', cafes)).toEqual([]);
  });
});

describe('startsWords', () => {
  it('matches word starts and a spaced-out query', () => {
    expect(startsWords('DG Gaming Cafe', 'dg')).toBe(true);
    expect(startsWords('Budget', 'dg')).toBe(false);
    expect(startsWords('Rockstar Gaming', 'rock star')).toBe(true);
  });
});
