import { apiClient, call } from './client';
import type {
  BookingDetail,
  BookingCreateRequest,
  BookingListParams,
  PaginatedResponse,
} from '@/types';

export async function createBooking(body: BookingCreateRequest): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.post('/api/v1/bookings', body));
}

export async function listBookings(params: BookingListParams = {}): Promise<PaginatedResponse<BookingDetail>> {
  return call(() => apiClient.get('/api/v1/bookings', { params }));
}

export async function getBooking(bookingId: string): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.get(`/api/v1/bookings/${bookingId}`));
}

export async function getPlatformFeePercentage(): Promise<{ platformFeePercentage: number }> {
  return call(() => apiClient.get('/api/v1/bookings/platform-fee'));
}

export async function cancelBooking(bookingId: string, reason?: string): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.post(`/api/v1/bookings/${bookingId}/cancel`, { reason }));
}

export interface QuoteRequest {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  seatsCount: number;
  playersCount?: number | null;
  promotionId?: string | null;
  promoCode?: string | null;
}

export interface QuoteAppliedOffer {
  id: string;
  title: string;
  label: string;
}

export interface QuoteOfferOption {
  id: string;
  title: string;
  label: string;
  discountAmount: number;
  slotsRemaining: number | null;
  when: string | null;
}

export interface QuoteOfferHint {
  id: string;
  title: string;
  message: string;
  /** Booking length (minutes) that would unlock this offer, when it's a length shortfall. */
  suggestedMinutes: number | null;
}

/** Server-computed price + eligibility preview — the single source of truth
 * checkout uses instead of re-implementing offer eligibility client-side
 * (that duplicated logic is what let an offer show as available but never
 * actually apply). No auth required. */
export interface QuoteResponse {
  baseAmount: number;
  discountAmount: number;
  subtotal: number;
  platformFee: number;
  total: number;
  appliedOffer: QuoteAppliedOffer | null;
  offerHint: QuoteOfferHint | null;
  /** Every offer valid for this exact slot, biggest saving first. */
  availableOffers: QuoteOfferOption[];
  /** Plain sentence when the offer/code the customer chose couldn't be used. */
  offerNote: string | null;
  allowedMinutes: number[];
  pricesByMinutes: Record<number, number>;
}

export async function getBookingQuote(body: QuoteRequest): Promise<QuoteResponse> {
  return call(() => apiClient.post('/api/v1/bookings/quote', body));
}
