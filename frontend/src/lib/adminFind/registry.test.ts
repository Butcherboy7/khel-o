import { describe, expect, it } from 'vitest';
import { findAdminItems } from './registry';

const first = (q: string) => findAdminItems(q)[0]?.id;

describe('admin find', () => {
  it('finds pages by everyday words', () => {
    expect(first('payables')).toBe('payables');
    expect(first('who owes')).toBe('payables');
    expect(first('users')).toBe('users');
    expect(first('drop off')).toBe('conversion');
    expect(first('applications')).toBe('applications');
  });
  it('forgives a typo', () => {
    expect(first('convertion')).toBe('conversion');
  });
  it('returns nothing for nothing', () => {
    expect(findAdminItems('')).toEqual([]);
    expect(findAdminItems('zzzzqqq')).toEqual([]);
  });
});
