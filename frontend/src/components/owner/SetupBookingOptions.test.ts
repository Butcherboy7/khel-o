import { describe, expect, it } from 'vitest';
import { allowedMinutes, bookingOptionsPayload, cheaperLongerLengths } from './SetupBookingOptions';
import type { TierConfig } from '@/types';

describe('longest booking and package prices on the setup screen', () => {
  it('stops the lengths at the longest booking', () => {
    expect(allowedMinutes(60, 180)).toEqual([60, 90, 120, 150, 180]);
    expect(allowedMinutes(30, null).at(-1)).toBe(480);
  });

  it('flags a longer session that costs less than a shorter one', () => {
    const rows = [
      { minutes: 60, price: 150, own: true },
      { minutes: 120, price: 300, own: true },
      { minutes: 150, price: 375, own: false }, // worked out from the 2 hr price
      { minutes: 180, price: 250, own: true },
      { minutes: 210, price: 325, own: false },
    ];
    // Compared with what the owner typed (2 hr), never the worked-out 2 hr 30.
    expect(cheaperLongerLengths(rows)).toEqual([{ longer: 180, shorter: 120 }]);
    expect(cheaperLongerLengths([{ minutes: 60, price: 150, own: true }, { minutes: 120, price: 280, own: true }])).toEqual([]);
  });

  it('sends only packages the setup can be booked for, and a start inside the limit', () => {
    const config = {
      pricePerHour: 150,
      tierType: 'gaming',
      platform: 'playstation',
      minBookingMinutes: 60,
      maxBookingMinutes: 180,
      defaultBookingMinutes: 240,
      lengthPrices: { '60': 140, '120': 280, '180': 400, '240': 500 },
    } as unknown as TierConfig;
    const out = bookingOptionsPayload(config);
    expect(out.lengthPrices).toEqual({ '120': 280, '180': 400 });
    expect(out.maxBookingMinutes).toBe(180);
    expect(out.defaultBookingMinutes).toBeNull();
  });
});
