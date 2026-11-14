import { describe, expect, it } from 'vitest';
import { parseQuery, machineFits } from './parse';
import { buildItems, type QFContext } from './registry';
import { rank, sections, highlight } from './search';
import { editDistance, tokenMatch } from './text';

// Sunday 15 Nov 2026, 10:00 IST
const NOW = new Date('2026-11-15T04:30:00Z');

const ctx = (over: Partial<QFContext> = {}): QFContext => ({
  role: 'owner',
  hostingChallenge: false,
  bookings: [],
  now: NOW,
  setups: [
    { id: 't-ps5', name: 'PS5', platform: 'playstation', model: 'PS5', pricePerHour: 149, totalSeats: 2, isActive: true },
    { id: 't-pro', name: 'PS5 Pro', platform: 'playstation', model: 'PS5 Pro', pricePerHour: 199, totalSeats: 2, isActive: true },
    { id: 't-pc', name: 'Gaming PCs', platform: 'pc', model: 'RTX 4070', pricePerHour: 99, totalSeats: 10, isActive: true },
    { id: 't-x', name: 'Xbox Series X', platform: 'xbox', model: 'Series X', pricePerHour: 129, totalSeats: 1, isActive: true },
  ],
  drops: [
    {
      id: 'd1',
      title: 'GTA 6 Launch Drop',
      game: 'GTA 6',
      status: 'live',
      flexible: true,
      startsOn: '2026-11-19',
      endsOn: '2026-12-02',
      consoles: [
        { key: 't-pro:1', label: 'PS5 Pro 1', platform: 'playstation' },
        { key: 't-pro:2', label: 'PS5 Pro 2', platform: 'playstation' },
      ],
    },
  ],
  ...over,
});

function top(query: string, c: QFContext = ctx()) {
  const q = parseQuery(query, NOW);
  return { q, results: rank(buildItems(c, q), q) };
}

describe('text', () => {
  it('forgives one typo but never a wrong number', () => {
    expect(editDistance('bookng', 'booking')).toBe(1);
    expect(tokenMatch('pricng', 'pricing')).toBeGreaterThan(0.6);
    expect(tokenMatch('2', '1')).toBe(0);
    expect(tokenMatch('ps5', 'ps4')).toBe(0);
  });
});

describe('parseQuery', () => {
  it('reads machine, length and day', () => {
    const q = parseQuery('Sell PS5 1 for 3 hours tomorrow', NOW);
    expect(q.machine).toMatchObject({ kind: 'playstation', model: 'PS5', n: 1 });
    expect(q.hours).toBe(3);
    expect(q.day?.iso).toBe('2026-11-16');
    expect(q.free).toEqual(['sell', 'ps5']);
  });
  it('does not take an hour count as a machine number', () => {
    const q = parseQuery('ps5 2 hours', NOW);
    expect(q.machine?.n).toBeUndefined();
    expect(q.hours).toBe(2);
  });
  it('reads dates and weekdays', () => {
    expect(parseQuery('bookings 19 nov', NOW).day?.iso).toBe('2026-11-19');
    expect(parseQuery('bookings on saturday', NOW).day?.iso).toBe('2026-11-21');
    expect(parseQuery("find tomorrow's bookings", NOW).day?.word).toBe('tomorrow');
    expect(parseQuery('1.5 hr', NOW).hours).toBe(1.5);
  });
  it('reads statuses and codes', () => {
    expect(parseQuery('cancelled bookings', NOW).status).toBe('cancelled');
    expect(parseQuery('GC-2026-A0R33G', NOW).code).toBe('GC-2026-A0R33G');
  });
  it('fits machines to names', () => {
    const m = parseQuery('ps5 2', NOW).machine!;
    expect(machineFits(m, 'PS5', 'playstation')).toBe(2);
    expect(machineFits(m, 'PS5 Pro 2', 'playstation')).toBe(1);
    expect(machineFits(m, 'Xbox Series X', 'xbox')).toBe(0);
  });
});

describe('scenarios from the brief', () => {
  it('A: opening time → Opening hours', () => {
    for (const s of ['Opening time', 'open time', 'when do we open', 'business hours', 'closing time', 'timings']) {
      expect(top(s).results[0].item.id, s).toBe('hours');
    }
  });

  it('B: PS5 2 maintenance → mark PS5 2 broken, prefilled', () => {
    const { results } = top('PS5 2 maintenance');
    expect(results[0].item.id).toBe('setup:t-ps5:broken');
    expect(results[0].item.title).toBe('Mark PS5 2 broken');
    expect(results[0].item.href).toContain('machine=PS5%202');
    expect(results[0].item.kind).toBe('flow');
  });

  it('B2: block PS5 Pro 2 → the drop block flow with that console', () => {
    const { results } = top('block ps5 pro 2');
    const hit = results.find((r) => r.item.id === 'drop:d1:block')!;
    expect(results.indexOf(hit)).toBeLessThan(2);
    expect(hit.item.href).toContain('console=t-pro%3A2');
  });

  it('C: GTA 6 minimum booking → drop minimum booking', () => {
    expect(top('GTA 6 minimum booking').results[0].item.id).toBe('drop:d1:min');
  });

  it('D: tomorrow bookings → bookings filtered to tomorrow', () => {
    for (const s of ['Tomorrow bookings', "find tomorrow's bookings", 'tmrw bookings']) {
      expect(top(s).results[0].item.href, s).toBe('/owner/bookings?day=tomorrow');
    }
  });

  it('E: sell PS5 1 for 3 hours → walk-in flow, console + length set, not executed', () => {
    const r = top('Sell PS5 Pro 1 for 3 hours').results[0].item;
    expect(r.id).toBe('drop:d1:walkin');
    expect(r.href).toContain('slot=walkin');
    expect(r.href).toContain('console=t-pro%3A1');
    expect(r.href).toContain('hours=3');
    expect(r.kind).toBe('flow');
  });

  it('E2: "ps5 1" alone is ambiguous inside a PS5 Pro-only drop when another setup fits better? still offers walk-in', () => {
    const r = top('sell ps5 1 for 3 hours').results[0].item;
    expect(r.id).toBe('drop:d1:walkin');
    expect(r.href).toContain('hours=3');
  });

  it('E3: without a drop, walk-in explains the seat split', () => {
    expect(top('mark walk-in', ctx({ drops: [] })).results[0].item.id).toBe('walkin-normal');
  });

  it('F: change xbox price → edit the Xbox setup', () => {
    const r = top('Change Xbox price').results[0].item;
    expect(r.id).toBe('setup:t-x:edit');
    expect(r.href).toBe('/owner/tiers?edit=t-x');
  });

  it('close café today → pause / emergency', () => {
    const ids = top('close cafe today').results.slice(0, 2).map((r) => r.item.id).sort();
    expect(ids).toEqual(['emergency', 'pause']);
  });

  it('synonyms reach setups', () => {
    for (const s of ['playstation', 'console', 'gaming setup', 'pc inventory']) {
      const group = top(s).results[0].item.group;
      expect(['setups', 'action'], s).toContain(group);
    }
  });

  it('typos still work', () => {
    expect(top('opning hours').results[0].item.id).toBe('hours');
    expect(top('payouts').results[0].item.id).toBe('payouts');
    expect(top('reviws').results[0].item.id).toBe('reviews');
  });

  it('GTA pricing → drop prices first', () => {
    const ids = top('GTA pricing').results.slice(0, 3).map((r) => r.item.id);
    expect(ids).toContain('drop:d1:prices');
  });
});

describe('roles', () => {
  it('staff never see owner-only things', () => {
    const c = ctx({ role: 'staff' });
    const q = parseQuery('price', NOW);
    const items = buildItems(c, q);
    expect(items.every((i) => i.roles.includes('staff'))).toBe(true);
    expect(items.some((i) => i.href.startsWith('/owner/settings'))).toBe(false);
    expect(items.some((i) => i.href.startsWith('/owner/drops'))).toBe(false);
    expect(top('opening hours', c).results.some((r) => r.item.id === 'hours')).toBe(false);
  });
});

describe('results', () => {
  it('no duplicates by destination, grouped with best match first', () => {
    const { results } = top('bookings');
    const hrefs = results.map((r) => r.item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const s = sections(results);
    expect(s[0].key).toBe('best');
  });
  it('gibberish finds nothing', () => {
    expect(top('zzqxv').results).toHaveLength(0);
  });
  it('highlights the typed words in the title', () => {
    const q = parseQuery('open', NOW);
    expect(highlight('Opening hours', q)).toEqual([[0, 4]]);
  });
});
