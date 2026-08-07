import { apiClient, call } from './client';
import type { PaymentOrder, PaymentVerifyRequest, PaymentVerifyResponse } from '@/types';

/** amount in response is INR — multiply × 100 before passing to Razorpay SDK */
export async function createPaymentOrder(bookingId: string): Promise<PaymentOrder> {
  return call(() => apiClient.post('/api/v1/payments/create-order', { bookingId }));
}

export async function verifyPayment(body: PaymentVerifyRequest): Promise<PaymentVerifyResponse> {
  return call(() => apiClient.post('/api/v1/payments/verify', body));
}
