'use client';

import { useState, useEffect } from 'react';
import { getPublicEnv } from '@/lib/runtimeEnv';

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss?: () => void;
  /** Razorpay reported the payment as failed (card declined, UPI timeout…). */
  onFailed?: (reason: string) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
  };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: 'payment.failed', cb: (res: { error?: { reason?: string; code?: string } }) => void) => void;
    };
  }
}

export function useRazorpay() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [mockModalState, setMockModalState] = useState<{
    isOpen: boolean;
    orderId: string;
    amount: number;
    onSuccess: () => void;
    onFailure: () => void;
    onClose: () => void;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Fetched as the page opens so Pay usually finds it ready.
    loadCheckout().then(() => setIsLoaded(true), () => setIsLoaded(false));
  }, []);

  const displayRazorpay = (
    options: Omit<RazorpayOptions, 'key'> & { key?: string }
  ) => {
    const razorpayKey =
      options.key ||
      getPublicEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID') ||
      'rzp_test_mock_khelo_key';

    const enableSandboxMock = getPublicEnv('NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS') === 'true';

    const isMockKey =
      enableSandboxMock ||
      !razorpayKey ||
      razorpayKey.startsWith('rzp_test_mock') ||
      razorpayKey.startsWith('rzp_test_placeholder');

    if (isMockKey) {
      // SANDBOX MODE: Show in-app modal with explicit Success/Failure buttons
      setMockModalState({
        isOpen: true,
        orderId: options.order_id,
        amount: options.amount,
        onSuccess: () => {
          options.handler({
            razorpay_payment_id: `pay_mock_${Date.now()}`,
            razorpay_order_id: options.order_id,
            razorpay_signature: 'mock_signature_valid',
          });
          setMockModalState(null);
        },
        onFailure: () => {
          // Simulate payment failure by calling handler with invalid signature
          // which will fail verification and show the failure UI
          options.handler({
            razorpay_payment_id: `pay_mock_failed_${Date.now()}`,
            razorpay_order_id: options.order_id,
            razorpay_signature: 'mock_signature_INVALID', // This will fail HMAC verification
          });
          setMockModalState(null);
        },
        onClose: () => {
          if (options.onDismiss) {
            options.onDismiss();
          }
          setMockModalState(null);
        },
      });
      return;
    }

    // A real key never falls back to the sandbox modal. It used to whenever
    // checkout.js had not arrived yet (slow mobile data, or blocked by an ad
    // blocker): a paying customer got the test "Success / Failure" buttons.
    // Now Pay waits for the script; if it cannot load, the payment is treated
    // like a closed window (the booking stays, Pay can be tapped again).
    if (typeof window.Razorpay === 'undefined') {
      loadCheckout().then(
        () => openCheckout(options, razorpayKey),
        () => {
          options.onFailed?.(CHECKOUT_UNAVAILABLE);
          options.onDismiss?.();
        },
      );
      return;
    }
    openCheckout(options, razorpayKey);
  };

  return { isLoaded, displayRazorpay, mockModalState };
}

/** onFailed reason when Razorpay's checkout script could not be loaded. */
export const CHECKOUT_UNAVAILABLE = 'checkout_unavailable';

let checkoutPromise: Promise<void> | null = null;

/** Loads Razorpay's checkout.js once. A failed or timed-out attempt is
 *  forgotten, so the next Pay tries again. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutPromise) return checkoutPromise;
  checkoutPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      checkoutPromise = null;
      reject(new Error(CHECKOUT_UNAVAILABLE));
    };
    const timer = setTimeout(fail, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.Razorpay) resolve();
      else fail();
    };
    script.onerror = fail;
    document.body.appendChild(script);
  });
  return checkoutPromise;
}

function openCheckout(options: Omit<RazorpayOptions, 'key'> & { key?: string }, razorpayKey: string) {
  const rzp = new window.Razorpay({
    ...options,
    key: razorpayKey,
    // Brand red (--primary in globals.css). Razorpay draws its header and
    // Pay button in this; it was still the old emerald green.
    theme: { color: '#D0463C', ...options.theme },
    modal: {
      ondismiss: () => {
        if (options.onDismiss) {
          options.onDismiss();
        }
      },
    },
  });

  rzp.on('payment.failed', (res) => options.onFailed?.(res.error?.reason || res.error?.code || 'unknown'));
  rzp.open();
}
