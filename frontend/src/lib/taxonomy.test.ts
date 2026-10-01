import { describe, expect, it } from 'vitest';
import { describeTier, optionLabel } from './taxonomy';
import type { Taxonomy } from '@/types/taxonomy';

const tax: Taxonomy = {
  version: 1,
  categories: [{ key: 'cue-sports', label: 'Cue Sports', rank: 0 }],
  activities: [
    {
      key: 'pool', label: 'Pool', category: 'cue-sports', rank: 1, aliases: [], bookable_now: true, billing_unit: 'hour',
      styles: [
        { key: 'pool.american', label: 'American pool', hint: 'Solids and stripes.', aliases: [] },
        { key: 'pool.english', label: 'English pool', aliases: [] },
      ],
      attributes: [
        { key: 'table_size', label: 'Table size', type: 'enum', level: 'recommended', options: ['7ft', '8ft', '9ft'] },
        { key: 'games_offered', label: 'Games you can play', type: 'multi', level: 'optional', options: ['8-ball', '9-ball', 'straight-pool'], filterable: false },
      ],
    },
    {
      key: 'snooker', label: 'Snooker', category: 'cue-sports', rank: 0, aliases: [], bookable_now: true, billing_unit: 'hour',
      styles: [],
      attributes: [{ key: 'table_size', label: 'Table size', type: 'enum', level: 'recommended', options: ['12ft', '10ft', 'mini'] }],
    },
  ],
};

describe('describeTier', () => {
  it('summarises style + size and keeps games for the detail view only', () => {
    const d = describeTier(tax, {
      taxonomyKey: 'pool.american',
      attributes: { table_size: '9ft', games_offered: ['8-ball', 'straight-pool'] },
    })!;
    expect(d.items).toEqual(['American pool', '9 ft']);
    expect(d.rows).toEqual([
      { label: 'Type', value: 'American pool' },
      { label: 'Table size', value: '9 ft' },
      { label: 'Games you can play', value: '8-ball, Straight pool' },
    ]);
    expect(d.styleHint).toBe('Solids and stripes.');
  });

  it("shows only what the owner filled in: 'Don't know' leaves no trace", () => {
    expect(describeTier(tax, { taxonomyKey: 'pool.english', attributes: {} })!.items).toEqual(['English pool']);
    expect(describeTier(tax, { taxonomyKey: 'snooker', attributes: { table_size: '12ft' } })!.items).toEqual(['12 ft']);
  });

  it('returns null when there is nothing to say (unclassified, unknown, or empty)', () => {
    expect(describeTier(tax, { taxonomyKey: null, attributes: { table_size: '9ft' } })).toBeNull();
    expect(describeTier(tax, { taxonomyKey: 'nope' })).toBeNull();
    expect(describeTier(tax, { taxonomyKey: 'snooker', attributes: {} })).toBeNull();
    expect(describeTier(undefined, { taxonomyKey: 'pool' })).toBeNull();
  });
});

describe('optionLabel', () => {
  it('formats the labels customers will read', () => {
    expect(optionLabel('9ft')).toBe('9 ft');
    expect(optionLabel('ps5-pro')).toBe('PS5 Pro');
    expect(optionLabel('8-ball')).toBe('8-ball');
    expect(optionLabel('triple')).toBe('Triple');
  });
});
