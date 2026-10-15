import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getCafeOpenStatus, isCafeOpenNow } from './format';

// The server renders in UTC, phones in India run on IST. "Open now" must come
// out the same on both, or React throws the server HTML away (errors #425/#422).
describe('opening hours are read in India time, whatever the machine clock', () => {
  const realTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'UTC'; // like the production server
  });
  afterAll(() => {
    process.env.TZ = realTz;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it('is open at 10:30 am IST for a 10 am - 10 pm café (05:00 UTC)', () => {
    at('2026-10-16T05:00:00Z');
    expect(isCafeOpenNow('10:00:00', '22:00:00')).toBe(true);
  });

  it('is closed at 11:30 pm IST for a 10 am - 10 pm café (18:00 UTC)', () => {
    at('2026-10-16T18:00:00Z');
    expect(isCafeOpenNow('10:00:00', '22:00:00')).toBe(false);
  });

  it('handles overnight hours: open at 1 am IST for a 10 am - 2 am café', () => {
    at('2026-10-15T19:30:00Z');
    expect(isCafeOpenNow('10:00:00', '02:00:00')).toBe(true);
  });

  it('says "opening soon" at 8 am IST for a café opening at 10 am', () => {
    at('2026-10-16T02:30:00Z');
    expect(getCafeOpenStatus('10:00:00', '22:00:00')).toBe('opening_soon');
  });
});
