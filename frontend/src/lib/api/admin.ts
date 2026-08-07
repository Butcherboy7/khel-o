import { apiClient, call } from './client';
import type {
  AdminCafe,
  AdminAnalytics,
  PaginatedResponse,
  User,
  CafeDetail,
  BookingDetail,
  Promotion,
  Review,
  AdminCafeListParams,
  AdminBookingListParams,
  AdminCafeVerifyRequest,
  UserRole,
} from '@/types';

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  return call(() => apiClient.get('/api/v1/admin/analytics'));
}

export async function listAdminCafes(params: AdminCafeListParams = {}): Promise<PaginatedResponse<AdminCafe>> {
  return call(() => apiClient.get('/api/v1/admin/cafes', { params }));
}

export async function listPendingCafes(params: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<AdminCafe>> {
  return call(() => apiClient.get('/api/v1/admin/cafes/pending', { params }));
}

export async function getAdminCafe(cafeId: string): Promise<{ cafe: CafeDetail; owner: User }> {
  return call(() => apiClient.get(`/api/v1/admin/cafes/${cafeId}`));
}

export async function verifyCafe(cafeId: string, body: AdminCafeVerifyRequest): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.patch(`/api/v1/admin/cafes/${cafeId}/verify`, body));
}

export async function listAdminUsers(
  params: { role?: string; isActive?: boolean; email?: string; page?: number; limit?: number } = {},
): Promise<PaginatedResponse<User>> {
  return call(() => apiClient.get('/api/v1/admin/users', { params }));
}

export async function deactivateUser(userId: string): Promise<{ user: User }> {
  return call(() => apiClient.patch(`/api/v1/admin/users/${userId}/deactivate`));
}

export async function activateUser(userId: string): Promise<{ user: User }> {
  return call(() => apiClient.patch(`/api/v1/admin/users/${userId}/activate`));
}

export async function changeUserRole(userId: string, role: UserRole): Promise<{ user: User }> {
  return call(() => apiClient.patch(`/api/v1/admin/users/${userId}/role`, { role }));
}

export async function listAdminBookings(params: AdminBookingListParams = {}): Promise<PaginatedResponse<BookingDetail>> {
  return call(() => apiClient.get('/api/v1/admin/bookings', { params }));
}

export async function deactivatePromotion(promotionId: string): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.patch(`/api/v1/admin/promotions/${promotionId}/deactivate`));
}

export async function setReviewVisibility(reviewId: string, isVisible: boolean): Promise<{ review: Review }> {
  return call(() => apiClient.patch(`/api/v1/admin/reviews/${reviewId}/visibility`, { isVisible }));
}
