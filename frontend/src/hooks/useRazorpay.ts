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
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
  }
}

export function useRazorpay() {
  const [isLoaded, setIsLoaded] = useState(false);

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

    if (!isLoaded || typeof window.Razorpay === 'undefined') {
      // Sandbox fallback mode if script fails or API key is not active
      alert(
        `[Sandbox Checkout] Simulating Razorpay Payment of ₹${
          options.amount / 100
        } for Order: ${options.order_id}`
      );
      options.handler({
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_order_id: options.order_id,
        razorpay_signature: 'mock_signature_valid',
      });
      return;
    }

    const rzp = new window.Razorpay({
      ...options,
      key: razorpayKey,
      theme: { color: '#10B981', ...options.theme },
    });

    rzp.open();
  };

  return { isLoaded, displayRazorpay };
}
