import { describe, expect, it } from 'vitest';
import { lengthLabel, offerUrgency } from './offers';

const NOW = new Date('2026-10-02T10:00:00Z').getTime();
const inDays = (d: number) => new Date(NOW + d * 24 * 60 * 60 * 1000).toISOString();

describe('offerUrgency', () => {
  it('says how many spots are left only when it is low', () => {
    expect(offerUrgency({ slotsRemaining: 4 }, NOW)).toBe('Only 4 left');
    expect(offerUrgency({ slotsRemaining: 5 }, NOW)).toBe('Only 5 left');
    expect(offerUrgency({ slotsRemaining: 6 }, NOW)).toBeNull();
    expect(offerUrgency({ slotsRemaining: null }, NOW)).toBeNull();
  });

  it('never advertises a sold-out offer as "Only 0 left"', () => {
    expect(offerUrgency({ slotsRemaining: 0 }, NOW)).toBeNull();
  });

  it('mentions an end date only when it is close', () => {
    expect(offerUrgency({ validUntil: inDays(0.5) }, NOW)).toBe('Ends today');
    expect(offerUrgency({ validUntil: inDays(2) }, NOW)).toBe('Ends in 2 days');
    expect(offerUrgency({ validUntil: inDays(10) }, NOW)).toBeNull();
    expect(offerUrgency({ validUntil: inDays(-1) }, NOW)).toBeNull();
  });

  it('prefers scarcity over a deadline', () => {
    expect(offerUrgency({ slotsRemaining: 3, validUntil: inDays(1) }, NOW)).toBe('Only 3 left');
  });
});

describe('lengthLabel', () => {
  it('reads like a person would say it', () => {
    expect(lengthLabel(15)).toBe('15 min');
    expect(lengthLabel(60)).toBe('1 hr');
    expect(lengthLabel(90)).toBe('1.5 hr');
    expect(lengthLabel(120)).toBe('2 hr');
  });
});
