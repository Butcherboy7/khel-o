import { describe, expect, it } from 'vitest';
import { cleanName, listVenueKind, venueArea, venueKind } from './venueKind';

describe('venueKind', () => {
  it('reads a Booking Soon listing from its name only', () => {
    expect(venueKind({ name: 'Lucky Billiards ', tiers: [] }).key).toBe('cue');
    expect(venueKind({ name: 'TAG Lounge - Snooker hub & Cafe' }).key).toBe('cue');
    expect(venueKind({ name: 'BOUNCE Bowling ', tiers: [] }).schemaType).toBe('BowlingAlley');
    expect(venueKind({ name: 'G5 Arena', tiers: [] }).key).toBe('gaming');
  });

  it('reads tiers when there are any', () => {
    const snooker = [
      { tierType: 'activity' as const, activityKind: 'French Snooker Table' },
      { tierType: 'activity' as const, activityKind: 'pool in french table' },
    ];
    expect(venueKind({ name: 'Snooker syndicate', tiers: snooker }).label).toBe('Snooker & Pool');
    expect(venueKind({ name: 'DG', tiers: [{ tierType: 'gaming' }, { tierType: 'activity', activityKind: 'Racing Simulator' }] }).key).toBe('gaming');
    expect(venueKind({ name: 'Mix', tiers: [{ tierType: 'gaming' }, ...snooker] }).key).toBe('gaming-cue');
  });
});

describe('venueArea / cleanName', () => {
  it('keeps short localities and drops address lines', () => {
    expect(venueArea('Kompally')).toBe('Kompally');
    expect(venueArea('2nd Floor, Ratna Arcade')).toBeNull();
    expect(venueArea('')).toBeNull();
    expect(cleanName('BOUNCE  Bowling ')).toBe('BOUNCE Bowling');
  });
});

describe('listVenueKind', () => {
  it('uses activity keys, or the name when there are none', () => {
    expect(listVenueKind({ name: 'Snooker syndicate', activities: ['snooker', 'pool'] }).key).toBe('cue');
    expect(listVenueKind({ name: 'DG', activities: ['console', 'racing-simulator'] }).key).toBe('gaming');
    expect(listVenueKind({ name: 'BOUNCE Bowling ', activities: [] }).key).toBe('bowling');
  });
});
