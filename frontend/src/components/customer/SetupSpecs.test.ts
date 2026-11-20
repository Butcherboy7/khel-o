import { describe, expect, it } from 'vitest';
import { pcSpecItems } from './SetupSpecs';
import { visibleDots } from './PhotoCarousel';
import { posterColors, gameArtKey } from '@/lib/gameArt';
import { founderCallUrl } from '@/lib/api/gta6Requests';

describe('pcSpecItems', () => {
  it('lists CPU, GPU, screen, refresh and RAM in order', () => {
    const items = pcSpecItems({ specs: { cpu: 'i5-13400F', gpu: 'RTX 4060', monitor: '24" 1080p IPS', ram: '16GB' }, refreshRateHz: 240 });
    expect(items.map((i) => i.label)).toEqual(['CPU', 'GPU', 'Screen', 'Refresh', 'RAM']);
    expect(items[3].value).toBe('240 Hz');
  });
  it('skips missing fields', () => {
    expect(pcSpecItems({ specs: { gpu: 'RTX 4090' }, refreshRateHz: null }).map((i) => i.label)).toEqual(['GPU']);
  });
});

describe('visibleDots', () => {
  it('shows all dots when few', () => expect(visibleDots(4, 2)).toEqual([0, 1, 2, 3]));
  it('windows around the current photo when many', () => {
    expect(visibleDots(12, 0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(visibleDots(12, 6)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(visibleDots(12, 11)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('posters', () => {
  it('colours are deterministic per game', () => expect(posterColors('Valorant')).toEqual(posterColors('Valorant')));
  it('art key ignores punctuation and case', () => expect(gameArtKey('Counter-Strike 2')).toBe('counterstrike2'));
});

describe('founderCallUrl', () => {
  it('builds a tel link', () => expect(founderCallUrl('918142128389')).toBe('tel:+918142128389'));
  it('refuses a short number', () => expect(founderCallUrl('123')).toBeNull());
});

import { gameArtFor, isGta6 } from '@/lib/gameArt';
describe('poster art lookup', () => {
  it('knows GTA 6 under any spelling and not GTA V', () => {
    expect(['GTA 6', 'gta6', 'GTA VI', 'Grand Theft Auto VI'].every(isGta6)).toBe(true);
    expect(isGta6('GTA V Online')).toBe(false);
  });
  it('finds art however the café typed the name', () => {
    for (const n of ['Counter-Strike 2', 'CS2', 'GTA V Online', 'GTA5', 'EA Sports FC 24', 'FIFA', "Marvel's Spider-Man 2", 'God of War Ragnark', 'GTA 6', 'Valorant', 'Fortnite', 'COD Warzone', 'Call of Duty: Warzone 2.0', 'GTA VI', 'Valorant PC']) {
      expect(gameArtFor(n), n).toBeTruthy();
    }
  });
  it('leaves a game with no licensed art to the generated poster', () => expect(gameArtFor('Among Us')).toBeNull());
});
