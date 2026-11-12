import { describe, it, expect } from 'vitest';
import { basePriceForMinutes } from '@/lib/pricing';
import { cabinFee, chargeModePatch } from './PcSetupExtras';
import { bookingOptionsPayload } from './SetupBookingOptions';
import type { TierConfig } from '@/types';

const pcConfig = (over: Partial<TierConfig> = {}): TierConfig => ({
  id: 't1', platform: 'pc', model: 'RTX 3060', totalSeats: 2, appBookableSeats: 2, pricePerHour: 150, tierType: 'gaming', ...over,
});

describe('cabin set-up (Wild Gaming: ₹300 cabin + ₹150 per PC)', () => {
  const cabin = { ...pcConfig(), ...chargeModePatch(pcConfig(), true), pricePerHour: 450, coopExtraPlayerPrice: 150, coopMaxPlayers: 5 };

  it('stores a cabin as one-PC price plus an extra per PC', () => {
    expect(cabin.isRoom).toBe(true);
    expect(cabinFee(cabin)).toBe(300);
  });

  it('prices 1, 2, 3 and 5 PCs for an hour as fee + PCs', () => {
    const priced = (players: number) => basePriceForMinutes(cabin, 60, { players, isCoop: players > 1 });
    expect([1, 2, 3, 5].map(priced)).toEqual([450, 600, 750, 1050]);
  });

  it('halves the whole thing for a 30-minute booking', () => {
    expect(basePriceForMinutes(cabin, 30, { players: 2, isCoop: true })).toBe(300);
  });

  it('sends the co-op fields and room flag, and clears hall-PC co-op', () => {
    const payload = bookingOptionsPayload(cabin);
    expect(payload).toMatchObject({ isRoom: true, coopEnabled: true, coopMaxPlayers: 5, coopExtraPlayerPrice: 150 });
    const hall = bookingOptionsPayload(pcConfig());
    expect(hall).toMatchObject({ isRoom: false, coopEnabled: false });
  });

  it('switching back to per-PC keeps the per-PC price', () => {
    const back = chargeModePatch(cabin as TierConfig, false);
    expect(back).toMatchObject({ isRoom: false, coopEnabled: false, pricePerHour: 150 });
  });

  it('sends the refresh rate and only FPS numbers that are real', () => {
    const payload = bookingOptionsPayload(pcConfig({ refreshRateHz: 240, fpsOverrides: { valorant: 310, cs2: 0 } }));
    expect(payload).toMatchObject({ refreshRateHz: 240, fpsOverrides: { valorant: 310 } });
  });
});
