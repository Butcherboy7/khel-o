import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useRazorpay, CHECKOUT_UNAVAILABLE } from './useRazorpay';

// Lets act() flush effects without React warning that this isn't a test env.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof useRazorpay>;
let hook: Hook;
let root: Root;

function Harness() {
  hook = useRazorpay();
  return null;
}

const checkoutScript = () =>
  document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');

// A constructor (Razorpay is used with `new`), whose window opens with `open`.
const fakeRazorpay = (open: () => void) =>
  vi.fn(function FakeRazorpay() {
    return { open, on: vi.fn() };
  });

function pay(key: string) {
  const calls = { failed: [] as string[], dismissed: 0 };
  act(() => {
    hook.displayRazorpay({
      key,
      order_id: 'order_1',
      amount: 14900,
      currency: 'INR',
      name: 'KHEL-O Gaming',
      description: 'Booking',
      handler: () => {},
      onFailed: (r) => calls.failed.push(r),
      onDismiss: () => { calls.dismissed += 1; },
    });
  });
  return calls;
}

describe('useRazorpay', () => {
  beforeEach(() => {
    delete (window as { Razorpay?: unknown }).Razorpay;
    document.body.innerHTML = '';
    root = createRoot(document.body.appendChild(document.createElement('div')));
    act(() => root.render(createElement(Harness)));
  });

  afterEach(() => {
    // End any download still in flight so it can't leak into the next test.
    checkoutScript()?.onerror?.(new Event('error'));
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('with a real key, never shows the sandbox modal while checkout.js is still loading', async () => {
    const open = vi.fn();
    const calls = pay('rzp_live_abc');
    expect(hook.mockModalState).toBeNull();

    // The script arrives: the real Razorpay window opens.
    (window as unknown as { Razorpay: unknown }).Razorpay = fakeRazorpay(open);
    await act(async () => { checkoutScript()!.onload!(new Event('load')); });
    expect(open).toHaveBeenCalledTimes(1);
    expect(calls).toEqual({ failed: [], dismissed: 0 });
    expect(hook.mockModalState).toBeNull();
  });

  it('with a real key, a blocked checkout.js counts as a closed window, and Pay can retry', async () => {
    const calls = pay('rzp_live_abc');
    await act(async () => { checkoutScript()!.onerror!(new Event('error')); });
    expect(calls).toEqual({ failed: [CHECKOUT_UNAVAILABLE], dismissed: 1 });
    expect(hook.mockModalState).toBeNull();
    // The failed tag is gone; the next Pay loads the script afresh.
    expect(checkoutScript()).toBeNull();
    pay('rzp_live_abc');
    expect(checkoutScript()).not.toBeNull();
  });

  it('gives up after 15 s if checkout.js never arrives', async () => {
    // End the download the page started on mount (real timers), then Pay
    // starts a fresh one under fake timers.
    await act(async () => { checkoutScript()!.onerror!(new Event('error')); });
    vi.useFakeTimers();
    const calls = pay('rzp_live_abc');
    expect(checkoutScript()).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(calls).toEqual({ failed: [CHECKOUT_UNAVAILABLE], dismissed: 1 });
  });

  it('opens straight away when checkout.js is already there', () => {
    const open = vi.fn();
    (window as unknown as { Razorpay: unknown }).Razorpay = fakeRazorpay(open);
    pay('rzp_live_abc');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('mock keys still get the sandbox modal', () => {
    pay('rzp_test_mock_khelo_key');
    expect(hook.mockModalState?.isOpen).toBe(true);
  });
});
