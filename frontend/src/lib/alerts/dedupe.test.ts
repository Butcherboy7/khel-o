import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAlert, ALERT_TTL_MS } from './dedupe';

describe('shouldAlert', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('allows the first sighting of a key', () => {
    expect(shouldAlert('booking_confirmed:abc')).toBe(true);
  });

  it('suppresses a repeat of the same key', () => {
    // Push and the 60s dashboard poll can surface the same booking. Without
    // this the café hears two chimes for one customer.
    shouldAlert('booking_confirmed:abc');
    expect(shouldAlert('booking_confirmed:abc')).toBe(false);
  });

  it('allows a different key', () => {
    shouldAlert('booking_confirmed:abc');
    expect(shouldAlert('booking_confirmed:def')).toBe(true);
  });

  it('allows the same key again after the TTL expires', () => {
    const t0 = 1_000_000;
    shouldAlert('booking_confirmed:abc', t0);
    expect(shouldAlert('booking_confirmed:abc', t0 + ALERT_TTL_MS + 1)).toBe(true);
  });

  it('survives a reload within the TTL', () => {
    // sessionStorage, not an in-memory Set: a refresh mid-shift must not
    // replay an alert the owner already dismissed.
    shouldAlert('booking_confirmed:abc');
    const raw = window.sessionStorage.getItem('khelo:seen-alerts');
    expect(raw).toContain('booking_confirmed:abc');
  });

  it('does not throw when sessionStorage is unavailable', () => {
    const original = window.sessionStorage.getItem;
    window.sessionStorage.getItem = () => {
      throw new Error('blocked');
    };
    expect(() => shouldAlert('booking_confirmed:xyz')).not.toThrow();
    window.sessionStorage.getItem = original;
  });
});
