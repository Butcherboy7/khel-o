'use client';

import { useState, useEffect } from 'react';

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
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
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

    if (window.Razorpay) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setIsLoaded(true);
    script.onerror = () => setIsLoaded(false);
    document.body.appendChild(script);
  }, []);

  const displayRazorpay = (
    options: Omit<RazorpayOptions, 'key'> & { key?: string }
  ) => {
    const razorpayKey =
      options.key ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      'rzp_test_mock_khelo_key';

    const enableSandboxMock = process.env.NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS === 'true';

    const isMockKey =
      enableSandboxMock ||
      !razorpayKey ||
      razorpayKey.startsWith('rzp_test_mock') ||
      razorpayKey.startsWith('rzp_test_placeholder');

    if (!isLoaded || typeof window.Razorpay === 'undefined' || isMockKey) {
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

    const rzp = new window.Razorpay({
      ...options,
      key: razorpayKey,
      theme: { color: '#10B981', ...options.theme },
      modal: {
        ondismiss: () => {
          if (options.onDismiss) {
            options.onDismiss();
          }
        },
      },
    });

    rzp.open();
  };

  return { isLoaded, displayRazorpay, mockModalState };
}
