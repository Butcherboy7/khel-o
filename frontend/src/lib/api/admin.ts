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

export async function listAdminReviews(
  params: { cafeId?: string; page?: number; limit?: number } = {},
): Promise<{ items: Review[]; total: number }> {
  return call(() => apiClient.get('/api/v1/admin/reviews', { params }));
}

// ── Café Suspension / Activation ────────────────────────────────────────────

export async function suspendCafe(cafeId: string, reason: string): Promise<{ id: string; name: string; verificationStatus: string; isActive: boolean }> {
  return call(() => apiClient.patch(`/api/v1/admin/cafes/${cafeId}/suspend`, { reason }));
}

export async function reactivateCafe(cafeId: string): Promise<{ id: string; name: string; verificationStatus: string; isActive: boolean }> {
  return call(() => apiClient.patch(`/api/v1/admin/cafes/${cafeId}/reactivate`));
}

export async function pauseCafeBookings(cafeId: string, paused: boolean): Promise<{ id: string; name: string; bookingsPaused: boolean }> {
  return call(() => apiClient.patch(`/api/v1/admin/cafes/${cafeId}/pause-bookings`, { paused }));
}

// ── Payment Oversight ────────────────────────────────────────────────────────

export interface AdminPayment {
  id: string;
  bookingId: string;
  bookingReference: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  failureReason: string | null;
  refundId: string | null;
  refundedAt: string | null;
  createdAt: string;
  cafeId: string;
  cafeName: string;
  gamerEmail: string;
  gamerName: string;
}

export async function listAdminPayments(
  params: { status?: string; cafeId?: string; page?: number; limit?: number } = {},
): Promise<{ items: AdminPayment[]; total: number; page: number; pageSize: number; totalPages: number }> {
  return call(() => apiClient.get('/api/v1/admin/payments', { params }));
}

// ── Staff Oversight ───────────────────────────────────────────────────────────

export interface AdminStaffMember {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  cafeId: string | null;
  cafeName: string | null;
  joinedAt: string | null;
  status: 'active';
}

export interface AdminPendingInvitation {
  id: string;
  email: string;
  fullName: string;
  cafeId: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export async function listAdminStaff(
  params: { cafeId?: string; page?: number; limit?: number } = {},
): Promise<{ items: AdminStaffMember[]; pendingInvitations: AdminPendingInvitation[]; total: number }> {
  return call(() => apiClient.get('/api/v1/admin/staff', { params }));
}

export async function revokeStaffAccess(userId: string, cafeId: string): Promise<{ userId: string; cafeId: string; revoked: boolean }> {
  return call(() => apiClient.delete(`/api/v1/admin/staff/${userId}/revoke`, { data: { cafeId } }));
}

// ── Audit Log ────────────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  reason: string | null;
  createdAt: string;
}

export async function listAuditLog(
  params: { entityType?: string; action?: string; page?: number; limit?: number } = {},
): Promise<{ items: AdminAuditEntry[]; total: number; page: number; pageSize: number; totalPages: number }> {
  return call(() => apiClient.get('/api/v1/admin/audit-log', { params }));
}

// ── Booking Oversight (force-cancel + refund) ────────────────────────────────

export async function forceCancelBooking(bookingId: string, reason: string): Promise<{ id: string; bookingReference: string; status: string }> {
  return call(() => apiClient.patch(`/api/v1/admin/bookings/${bookingId}/force-cancel`, { reason }));
}

export async function refundBooking(bookingId: string, reason: string): Promise<{ refundId: string | null; status: string; amount: number }> {
  return call(() => apiClient.post(`/api/v1/admin/bookings/${bookingId}/refund`, { reason }));
}

// ── Support Tickets ───────────────────────────────────────────────────────────

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  description: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high';
  bookingId: string | null;
  cafeId: string | null;
  adminNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listSupportTickets(
  params: { status?: string; category?: string; page?: number; limit?: number } = {},
): Promise<{ items: SupportTicket[]; total: number; page: number; pageSize: number }> {
  return call(() => apiClient.get('/api/v1/admin/support/tickets', { params }));
}

export async function getSupportTicket(ticketId: string): Promise<{ ticket: SupportTicket }> {
  return call(() => apiClient.get(`/api/v1/admin/support/tickets/${ticketId}`));
}

export async function updateSupportTicket(
  ticketId: string,
  payload: { status?: string; priority?: string; adminNotes?: string },
): Promise<{ ticket: SupportTicket }> {
  return call(() => apiClient.patch(`/api/v1/admin/support/tickets/${ticketId}`, payload));
}

// ── Platform Settings ─────────────────────────────────────────────────────────

export interface PlatformSettings {
  commissionPercentage: number;
  supportEmail: string;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  updatedAt: string;
}

export async function getPlatformSettings(): Promise<{ settings: PlatformSettings }> {
  return call(() => apiClient.get('/api/v1/admin/settings'));
}

export async function updatePlatformSettings(payload: Partial<PlatformSettings>): Promise<{ settings: PlatformSettings }> {
  return call(() => apiClient.patch('/api/v1/admin/settings', payload));
}
