import { describe, expect, it } from 'vitest';
import { blockTimes, calDate, clock, wireTime } from './drops';

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
