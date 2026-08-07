import { apiClient, call } from './client';
import type {
  OwnerDashboard,
  OwnerBookingListResponse,
  OwnerBookingParams,
  BookingDetail,
  User,
  OwnerPayoutAccount,
  PayoutSetupRequest,
} from '@/types';

export async function getOwnerDashboard(): Promise<OwnerDashboard> {
  return call(() => apiClient.get('/api/v1/owner/dashboard'));
}

export async function listOwnerBookings(params: OwnerBookingParams = {}): Promise<OwnerBookingListResponse> {
  return call(() => apiClient.get('/api/v1/owner/bookings', { params }));
}

export async function updateOwnerBookingStatus(
  bookingId: string,
  status: 'completed' | 'no_show',
): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.patch(`/api/v1/owner/bookings/${bookingId}/status`, { status }));
}

export async function checkinBooking(bookingId: string): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.post(`/api/v1/owner/bookings/${bookingId}/checkin`));
}

export async function emergencyCloseCafe(cafeId: string, date: string): Promise<{ cancelledBookings: number }> {
  return call(() => apiClient.post(`/api/v1/owner/cafes/${cafeId}/emergency-close`, null, { params: { date } }));
}

export async function createStaff(body: {
  email: string;
  fullName: string;
  password: string;
  phoneNumber?: string;
}): Promise<{ staff: User }> {
  return call(() => apiClient.post('/api/v1/owner/staff', body));
}

export async function listStaff(): Promise<{ staff: User[] }> {
  return call(() => apiClient.get('/api/v1/owner/staff'));
}

export async function listOwnerStaff(): Promise<{ staff: User[] }> {
  return call(() => apiClient.get('/api/v1/owner/staff'));
}

export async function createOwnerStaff(body: {
  email: string;
  fullName: string;
  password: string;
  phoneNumber?: string;
}): Promise<{ staff: User }> {
  return call(() => apiClient.post('/api/v1/owner/staff', body));
}

export async function deleteOwnerStaff(staffId: string): Promise<{ message: string }> {
  return call(() => apiClient.delete(`/api/v1/owner/staff/${staffId}`));
}

export async function getOwnerPayoutSummary(): Promise<any> {
  return call(() => apiClient.get('/api/v1/owner/payouts/summary'));
}

export async function getOnboardingDraft(): Promise<{ draft: any }> {
  return call(() => apiClient.get('/api/v1/owner/onboarding/draft'));
}

export async function saveOnboardingDraft(step: number, draftData: any): Promise<{ saved: boolean; cafeId?: string }> {
  return call(() => apiClient.post('/api/v1/owner/onboarding/draft', { step, draftData }));
}

export async function submitOnboardingApplication(body: any): Promise<{ cafeId: string; status: string }> {
  return call(() => apiClient.post('/api/v1/owner/onboarding/submit', body));
}

export async function getOwnerStatus(): Promise<any> {
  return call(() => apiClient.get('/api/v1/owner/status'));
}

export async function getOwnerBookings(params: OwnerBookingParams = {}): Promise<OwnerBookingListResponse> {
  return call(() => apiClient.get('/api/v1/owner/bookings', { params }));
}

export async function getOwnerAnalytics(): Promise<any> {
  return call(() => apiClient.get('/api/v1/owner/analytics'));
}

export async function getPayoutStatus(): Promise<{ payoutAccount: OwnerPayoutAccount | null }> {
  return call(() => apiClient.get('/api/v1/owner/payouts/status'));
}

export async function setupPayout(body: PayoutSetupRequest): Promise<{ payoutAccount: OwnerPayoutAccount }> {
  return call(() => apiClient.post('/api/v1/owner/payouts/setup', body));
}

export async function getOwnerCafeId(): Promise<{ cafeId: string }> {
  const statusRes = await getOwnerStatus();
  if (!statusRes.cafe?.id) {
    throw new Error('No café found for this owner account');
  }
  return { cafeId: statusRes.cafe.id };
}
