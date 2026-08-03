import type { PaymentStatus } from './shared';

/**
 * Returned by POST /api/v1/payments/create-order.
 * CRITICAL: amount is in INR (whole rupees), NOT paise.
 * Multiply × 100 before passing to Razorpay SDK.
 */
export interface PaymentOrder {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface PaymentVerifyRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface PaymentVerifyResponse {
  id: string;
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
}
