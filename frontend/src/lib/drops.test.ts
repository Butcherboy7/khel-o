import { describe, expect, it } from 'vitest';
import { blockTimes, calDate, clock, dropLengths, dropSeatPrice, wireTime } from './drops';

describe('launch midnight', () => {
  it('12 AM on launch day is shown as the next date of the night before', () => {
    expect(calDate('2026-11-18', '24:00')).toBe('2026-11-19');
    expect(calDate('2026-11-18', '26:00')).toBe('2026-11-19');
    expect(calDate('2026-11-18', '22:00')).toBe('2026-11-18');
    expect(calDate('2026-11-30', '25:00')).toBe('2026-12-01');
  });
  it('reads 24:00 as 12 AM and sends 00:00 to the server', () => {
    expect(clock('24:00')).toBe('12 AM');
    expect(wireTime('24:00')).toBe('00:00');
    expect(blockTimes({ startTime: '24:00', endTime: '30:00', hours: 6 })).toBe('12 AM to 6 AM next day · 6 hours');
  });
});

describe('drop prices', () => {
  const packs = [{ hours: 1, price: 250 }, { hours: 3, price: 650 }, { hours: 5, price: 850 }];
  it('uses the package price and only offers package lengths', () => {
    const d = { pricePerHour: 250, maxHours: 5, lengthPrices: packs };
    expect(dropLengths(d)).toEqual([1, 3, 5]);
    expect(dropSeatPrice(d, 12 * 60, 3)).toBe(650);
    expect(dropSeatPrice(d, 12 * 60, 5)).toBe(850);
  });
  it('moves hours inside a time price, past midnight too (same as the server)', () => {
    const bands = [{ start: '00:00', end: '06:00', perHour: 200 }, { start: '18:00', end: '20:00', perHour: 350 }];
    const d = { pricePerHour: 250, maxHours: 5, timePrices: bands };
    expect(dropSeatPrice(d, 19 * 60, 2)).toBe(600);
    expect(dropSeatPrice(d, 23 * 60, 3)).toBe(650);
    expect(dropSeatPrice({ ...d, lengthPrices: packs }, 25 * 60, 3)).toBe(500);
  });
});
