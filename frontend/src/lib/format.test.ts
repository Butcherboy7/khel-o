import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { customerPrice, getCafeOpenStatus, getOwnerPayoutAmount, isCafeOpenNow } from './format';

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

describe('customerPrice (KHEL-O ₹1 off a round price)', () => {
  it('drops ₹1 off prices ending in 0 and leaves the rest', () => {
    expect(customerPrice(150)).toBe(149);
    expect(customerPrice(300)).toBe(299);
    expect(customerPrice(155)).toBe(155);
    expect(customerPrice(225)).toBe(225);
    expect(customerPrice(187.5)).toBe(187.5);
    expect(customerPrice(0)).toBe(0);
  });
});

describe('getOwnerPayoutAmount with the ₹1 KHEL-O pays', () => {
  it('owner is still owed the full café price', () => {
    expect(getOwnerPayoutAmount({ totalAmount: 149, gatewayFee: 0, kheloDiscount: 1 })).toBe(150);
    expect(getOwnerPayoutAmount({ totalAmount: 154.96, gatewayFee: 5.96, kheloDiscount: 1 })).toBeCloseTo(150);
    expect(getOwnerPayoutAmount({ totalAmount: 160, gatewayFee: 5 })).toBe(155);
  });
});
