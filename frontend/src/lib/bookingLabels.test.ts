import { describe, expect, it } from 'vitest';
import { groupLabel } from './bookingLabels';

describe('groupLabel', () => {
  it('says how many PCs a cabin booking needs', () => {
    expect(groupLabel({ seatsCount: 1, playersCount: 5, isRoom: true })).toBe('Cabin · 5 PCs');
    expect(groupLabel({ seatsCount: 1, playersCount: 1, isRoom: true })).toBe('Cabin · 1 PC');
  });
  it('falls back to one PC when a cabin booking has no group size', () => {
    expect(groupLabel({ isRoom: true })).toBe('Cabin · 1 PC');
  });
  it('says when friends share one console', () => {
    expect(groupLabel({ seatsCount: 1, playersCount: 4 })).toBe('4 players sharing 1 console');
  });
  it('says how many machines when each player has their own', () => {
    expect(groupLabel({ seatsCount: 3, playersCount: 3 })).toBe('3 machines');
    expect(groupLabel({ seatsCount: 3 })).toBe('3 machines');
  });
  it('says nothing for one player on one machine', () => {
    expect(groupLabel({ seatsCount: 1, playersCount: 1 })).toBeNull();
    expect(groupLabel({})).toBeNull();
  });
});
