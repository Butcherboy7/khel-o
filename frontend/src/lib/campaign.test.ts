import { describe, expect, it } from 'vitest';
import { codeFromParams, isInAppBrowser, normaliseCode, spotsLine } from './campaign';

describe('normaliseCode', () => {
  it('uppercases and trims what a person types', () => {
    expect(normaliseCode(' dgfounder ')).toBe('DGFOUNDER');
  });
  it('rejects things that cannot be a code', () => {
    expect(normaliseCode('')).toBeNull();
    expect(normaliseCode(null)).toBeNull();
    expect(normaliseCode('ab')).toBeNull();
    expect(normaliseCode('not a code!')).toBeNull();
  });
});

describe('codeFromParams', () => {
  it('reads promoCode first, then code', () => {
    const p = new URLSearchParams('promoCode=dgfounder&code=other1');
    expect(codeFromParams((k) => p.get(k))).toBe('DGFOUNDER');
    const q = new URLSearchParams('code=rockstar1');
    expect(codeFromParams((k) => q.get(k))).toBe('ROCKSTAR1');
  });
});

describe('isInAppBrowser', () => {
  it('spots Instagram and Facebook webviews, not a normal browser', () => {
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 13) AppleWebKit Instagram 300.0.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36')).toBe(false);
  });
});

describe('spotsLine', () => {
  const base = { maxUses: 100, claimed: 0, remaining: 100, full: false };
  it('states only the true limit while the count is small', () => {
    expect(spotsLine(base)).toBe('First 100 players only');
    expect(spotsLine({ ...base, claimed: 9, remaining: 91 })).toBe('First 100 players only');
  });
  it('shows the real count once it means something', () => {
    expect(spotsLine({ ...base, claimed: 37, remaining: 63 })).toBe('37 of 100 claimed · 63 left');
  });
  it('says plainly when it is gone, and says nothing when uncapped', () => {
    expect(spotsLine({ ...base, claimed: 100, remaining: 0, full: true })).toBe('All 100 spots are claimed');
    expect(spotsLine({ maxUses: null, claimed: 5, remaining: null, full: false })).toBeNull();
  });
});
