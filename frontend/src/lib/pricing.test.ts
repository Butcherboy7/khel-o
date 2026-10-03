import { describe, expect, it } from 'vitest';
import { basePriceForMinutes } from './pricing';

// Expected values are the backend's own (tests/test_duration_pricing_offer_safety.py
// semantics): custom 15/30 prices win, otherwise hourly/4 and hourly/2.
describe('basePriceForMinutes mirrors the server', () => {
  const tier = { pricePerHour: 100 };

  it('derives 15/30 min from hourly when the owner set nothing', () => {
    expect(basePriceForMinutes(tier, 15)).toBe(25);
    expect(basePriceForMinutes(tier, 30)).toBe(50);
  });

  it("uses the owner's own 15 and 30 minute prices", () => {
    const t = { pricePerHour: 100, price15m: 40, price30m: 70 };
    expect(basePriceForMinutes(t, 15)).toBe(40);
    expect(basePriceForMinutes(t, 30)).toBe(70);
  });

  it('charges hourly pro-rata from 60 minutes up, ignoring the short prices', () => {
    const t = { pricePerHour: 100, price15m: 40, price30m: 70 };
    expect(basePriceForMinutes(t, 60)).toBe(100);
    expect(basePriceForMinutes(t, 90)).toBe(150);
    expect(basePriceForMinutes(t, 120)).toBe(200);
  });

  it('multiplies solo bookings by consoles, custom price included', () => {
    expect(basePriceForMinutes({ pricePerHour: 100, price15m: 40 }, 15, { seats: 3 })).toBe(120);
  });

  it('co-op: unit price plus extra-per-friend scaled by minutes/60', () => {
    const t = { pricePerHour: 100, price15m: 40, coopExtraPlayerPrice: 20 };
    expect(basePriceForMinutes(t, 60, { isCoop: true, players: 3 })).toBe(140);
    expect(basePriceForMinutes(t, 15, { isCoop: true, players: 2 })).toBe(45); // 40 + 20*1*0.25
  });

  it('keeps paise, rounded like the server', () => {
    expect(basePriceForMinutes({ pricePerHour: 90 }, 15)).toBe(22.5);
    expect(basePriceForMinutes({ pricePerHour: 70 }, 15)).toBe(17.5);
  });
  it("uses the owner's 30-min co-op price (backend tests/test_coop_price_30m.py)", () => {
    const ps5 = { pricePerHour: 140, price15m: 59, price30m: 89, coopExtraPlayerPrice: 120, coopPrice30m: 180 };
    expect(basePriceForMinutes(ps5, 30, { players: 2, isCoop: true })).toBe(180);
    expect(basePriceForMinutes(ps5, 30, { players: 3, isCoop: true })).toBe(240);
    expect(basePriceForMinutes(ps5, 60, { players: 2, isCoop: true })).toBe(260);
    expect(basePriceForMinutes(ps5, 30)).toBe(89);
    expect(basePriceForMinutes({ ...ps5, coopPrice30m: null }, 30, { players: 2, isCoop: true })).toBe(149);
  });
});
