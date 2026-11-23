import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONSOLE_MODELS } from './consoles';
import { PLATFORM_MODELS } from './platforms';
import { gameArtFor } from '@/lib/gameArt';

describe('console picker catalogue', () => {
  it('offers exactly the saved model list (plus Custom) for every console platform', () => {
    for (const platform of ['playstation', 'xbox', 'nintendo'] as const) {
      expect([...CONSOLE_MODELS[platform].map((m) => m.model), 'Custom']).toEqual(PLATFORM_MODELS[platform]);
    }
  });

  it('has a photo file for every card that claims one', () => {
    for (const list of Object.values(CONSOLE_MODELS)) {
      for (const m of list) {
        expect(existsSync(join(__dirname, '../../public/consoles', `${m.key}.webp`))).toBe(m.hasPhoto);
      }
    }
  });
});

describe('Marvel Rivals poster', () => {
  it.each(['Marvel Rivals', 'MARVEL RIVALS', 'Marvel Rivals PC', 'Rivals'])('%s gets the poster', (name) => {
    expect(gameArtFor(name)).toBe('/games/marvelrivals.jpg');
  });
});
