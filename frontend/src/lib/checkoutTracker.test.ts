import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKOUT_UNAVAILABLE_REASON, createCheckoutTracker } from './checkoutTracker';

describe('createCheckoutTracker', () => {
  const calls: [string, Record<string, unknown>][] = [];
  const make = () => createCheckoutTracker({ slug: 'valorant-5v5-xqz', kind: 'team', track: (a, m) => calls.push([a, m]) });
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('closing the window counts as dismissed once, only after the short wait', () => {
    const t = make();
    t.dismissed();
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1600);
    t.dismissed();
    vi.advanceTimersByTime(1600);
    expect(calls).toEqual([['challenge_pay_dismissed', { challenge: 'valorant-5v5-xqz', kind: 'team', via: 'closed', afterFailure: false, attempts: 0 }]]);
  });

  it('a close that comes with a payment is never reported as dismissed', () => {
    const t = make();
    t.dismissed(); // the window closes ...
    t.paymentReceived(); // ... and the success callback lands a moment later
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(0);
  });

  it('a payment that came through first is never reported as failed or dismissed', () => {
    const t = make();
    t.paymentReceived();
    t.failed('payment_failed');
    t.dismissed();
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(0);
  });

  it('each failed attempt is logged with its number, and a later close notes the earlier failure', () => {
    const t = make();
    t.failed('payment_failed');
    t.failed('payment_failed');
    t.dismissed();
    vi.advanceTimersByTime(1600);
    expect(calls.map((c) => c[0])).toEqual(['challenge_pay_failed', 'challenge_pay_failed', 'challenge_pay_dismissed']);
    expect(calls[1][1]).toMatchObject({ attempt: 2, reason: 'payment_failed' });
    expect(calls[2][1]).toMatchObject({ afterFailure: true, attempts: 2 });
  });

  it('cancelling inside the checkout is a dismissal, not a failure, and the later close does not double it', () => {
    const t = make();
    t.failed('payment_cancelled');
    t.dismissed();
    vi.advanceTimersByTime(1600);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('challenge_pay_dismissed');
    expect(calls[0][1]).toMatchObject({ via: 'cancelled_in_checkout' });
  });

  it('a checkout that never opened is one failure with its own reason and no "dismissed"', () => {
    const t = make();
    t.failed(CHECKOUT_UNAVAILABLE_REASON);
    t.dismissed();
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual([['challenge_pay_failed', { challenge: 'valorant-5v5-xqz', kind: 'team', reason: 'checkout_unavailable', attempt: 0 }]]);
  });

  it('a payment our server could not confirm is its own event, never "failed", and carries only a short code', () => {
    const t = make();
    t.paymentReceived();
    t.verifyError('PAYMENT_FAILED <script>');
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('challenge_pay_verify_error');
    expect(String(calls[0][1].code)).not.toMatch(/[<>]/);
  });

  it('puts no money, order, payment or contact detail in any event', () => {
    const t = make();
    t.failed('payment_failed');
    t.dismissed();
    vi.advanceTimersByTime(1600);
    t.verifyError('X');
    for (const [, meta] of calls) {
      expect(Object.keys(meta).sort().join(',')).not.toMatch(/amount|order|payment_id|email|phone|name|contact/);
    }
  });
});
