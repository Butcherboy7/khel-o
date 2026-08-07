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

export async function cancelBooking(bookingId: string, reason?: string): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.post(`/api/v1/bookings/${bookingId}/cancel`, { reason }));
}
