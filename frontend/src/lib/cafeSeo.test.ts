import { describe, expect, it } from 'vitest';
import { buildCafeSeo, nameWithArea, venueNoun } from './cafeSeo';

const tier = (over: Record<string, unknown>) =>
  ({ isActive: true, tierType: 'gaming', activityKind: null, name: 'PS5', pricePerHour: 140, ...over }) as never;

const cafe = (over: Record<string, unknown> = {}) =>
  ({
    name: 'Rockstar Gaming Cafe',
    city: 'Hyderabad',
    tiers: [tier({}), tier({ name: 'PC', pricePerHour: 100 })],
    averageRating: 0,
    totalReviews: 0,
    isLeadListing: false,
    ...over,
  }) as never;

describe('venueNoun', () => {
  it('does not call a bowling alley or a snooker hub a gaming café', () => {
    expect(venueNoun([tier({ tierType: 'activity', activityKind: 'Bowling' })])).toBe('Bowling Alley');
    expect(venueNoun([tier({ tierType: 'activity', activityKind: 'Snooker' })])).toBe('Snooker & Pool Hub');
    expect(venueNoun([tier({}), tier({ tierType: 'activity', activityKind: 'Pool' })])).toBe('Gaming Café & Snooker');
    expect(venueNoun([tier({})])).toBe('Gaming Café');
  });

  it('ignores inactive setups', () => {
    expect(venueNoun([tier({ isActive: false }), tier({ tierType: 'activity', activityKind: 'Bowling' })])).toBe('Bowling Alley');
  });
});

describe('nameWithArea', () => {
  it('adds the area unless the name already has it', () => {
    expect(nameWithArea('Rockstar Gaming Cafe', 'Bowenpally')).toBe('Rockstar Gaming Cafe, Bowenpally');
    expect(nameWithArea('Gamers Guild Hyderabad', 'Hyderabad')).toBe('Gamers Guild Hyderabad');
  });
});

describe('buildCafeSeo', () => {
  it('leads a bookable café with booking and its starting price', () => {
    const seo = buildCafeSeo(cafe({ averageRating: 4.6, totalReviews: 23 }), { locality: 'Bowenpally' });
    expect(seo.title).toBe('Rockstar Gaming Cafe, Bowenpally — Book from ₹100/hr');
    expect(seo.description).toContain('Rated 4.6★ (23 reviews)');
    expect(seo.description).toContain('no calls needed');
  });

  it('never promises booking for a booking-soon café, and shows prices as approximate', () => {
    const seo = buildCafeSeo(cafe({ name: 'Gamers Guild', isLeadListing: true }), { waitlistCount: 2 });
    expect(seo.title).toBe('Gamers Guild, Hyderabad — Prices, Photos & Reviews');
    expect(seo.description).toContain('Approx ₹100/hr');
    expect(seo.description).not.toMatch(/book a|pay online|real-time/i);
    expect(seo.description).not.toContain('2 players');
  });

  it('quotes the waitlist only once it is big enough to persuade', () => {
    const seo = buildCafeSeo(cafe({ name: 'Zega Gaming', city: 'Bengaluru', isLeadListing: true }), { waitlistCount: 18 });
    expect(seo.description).toContain('18 players want to book Zega Gaming online');
  });
});
