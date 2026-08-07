import axios from 'axios';
import { CafeListItem, CafeDetail, PaginatedResponse, BookingDetail, User, HardwareTier, TierSpecs, PromotionDetail, AdminCafe, OwnerPayoutAccount } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/api/v1/auth/login') &&
      !originalRequest.url?.includes('/api/v1/auth/register') &&
      !originalRequest.url?.includes('/api/v1/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refreshToken: refreshToken,
          });

          const newAccessToken = res.data?.data?.accessToken;
          if (newAccessToken) {
            localStorage.setItem('accessToken', newAccessToken);
            api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            processQueue(null, newAccessToken);
            return api(originalRequest);
          }
        } catch (refreshError) {
          processQueue(refreshError, null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

export async function getMe(): Promise<User> {
  const res = await api.get('/api/v1/auth/me');
  return res.data.data.user;
}

export async function listCafes(params: {
  city?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<CafeListItem>> {
  const res = await api.get('/api/v1/cafes', { params });
  return res.data.data;
}

export async function getCafe(cafeId: string): Promise<CafeDetail> {
  const res = await api.get(`/api/v1/cafes/${cafeId}`);
  return res.data.data.cafe;
}

export async function getOwnerCafe(): Promise<CafeListItem | null> {
  const res = await api.get('/api/v1/cafes', {
    params: { page: 1, limit: 1 }
  });
  const items = res.data.data.items as CafeListItem[];
  return items && items.length > 0 ? items[0] : null;
}

export interface CafeFormData {
  name: string;
  description: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  phoneNumber: string;
  email: string;
  openingTime: string;
  closingTime: string;
  totalSeats: number;
  amenities: string[];
  photos: string[];
}

export async function createCafe(data: CafeFormData): Promise<CafeDetail> {
  const res = await api.post('/api/v1/cafes', data);
  return res.data.data.cafe as CafeDetail;
}

export async function updateCafe(
  cafeId: string,
  data: Partial<CafeFormData>
): Promise<CafeDetail> {
  const res = await api.patch(`/api/v1/cafes/${cafeId}`, data);
  return res.data.data.cafe as CafeDetail;
}

export interface TierFormData {
  name: string;
  description?: string;
  specs: TierSpecs;
  totalSeats: number;
  appBookableSeats: number;
  presetCategory?: string | null;
  pricePerHour: number;
  isActive: boolean;
}

export async function listCafeTiers(cafeId: string): Promise<HardwareTier[]> {
  const res = await api.get(`/api/v1/cafes/${cafeId}/tiers`);
  return res.data.data.tiers as HardwareTier[];
}

export async function createTier(
  cafeId: string,
  data: TierFormData
): Promise<HardwareTier> {
  const res = await api.post(`/api/v1/cafes/${cafeId}/tiers`, data);
  return res.data.data.tier as HardwareTier;
}

export async function updateTier(
  cafeId: string,
  tierId: string,
  data: Partial<TierFormData>
): Promise<HardwareTier> {
  const res = await api.patch(
    `/api/v1/cafes/${cafeId}/tiers/${tierId}`,
    data
  );
  return res.data.data.tier as HardwareTier;
}

export interface CreateBookingRequest {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  promotionId?: string;
  notes?: string;
}

export interface BookingResponse {
  id: string;
  bookingReference: string;
  gamerId: string;
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  baseAmount: number;
  discountAmount: number;
  gatewayFee: number;
  totalAmount: number;
  status: string;
  promotionId: string | null;
  qrCodeUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createBooking(
  data: CreateBookingRequest
): Promise<BookingResponse> {
  const res = await api.post('/api/v1/bookings', data);
  return res.data.data.booking;
}

export interface ListBookingsParams {
  page?: number;
  limit?: number;
}

export interface ListBookingsResponse {
  bookings: BookingDetail[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listGamerBookings(
  params: ListBookingsParams = {}
): Promise<ListBookingsResponse> {
  const res = await api.get('/api/v1/bookings', { params });
  const data = res.data.data;
  return {
    bookings: data.bookings || data.items || [],
    total: data.total || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 20,
    totalPages: data.totalPages || 0,
  };
}

export async function updateBookingStatus(
  bookingId: string,
  status: 'completed' | 'no_show'
): Promise<BookingDetail> {
  const res = await api.patch(
    `/api/v1/bookings/${bookingId}/status`,
    { status }
  );
  return res.data.data.booking as BookingDetail;
}

export interface PromotionFormData {
  cafeId: string;
  title: string;
  description?: string;
  discountPercentage: number;
  applicableTierId?: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses?: number | null;
  isActive: boolean;
}

export async function listPromotions(
  cafeId: string
): Promise<PromotionDetail[]> {
  const res = await api.get(`/api/v1/promotions/cafe/${cafeId}`);
  return res.data.data.promotions as PromotionDetail[];
}

export async function createPromotion(
  data: PromotionFormData
): Promise<PromotionDetail> {
  const res = await api.post('/api/v1/promotions', data);
  return res.data.data.promotion as PromotionDetail;
}

export async function updatePromotion(
  promotionId: string,
  data: Partial<PromotionFormData>
): Promise<PromotionDetail> {
  const res = await api.patch(`/api/v1/promotions/${promotionId}`, data);
  return res.data.data.promotion as PromotionDetail;
}

export async function deletePromotion(promotionId: string): Promise<void> {
  await api.delete(`/api/v1/promotions/${promotionId}`);
}

export async function getPendingCafes(): Promise<AdminCafe[]> {
  const res = await api.get('/api/v1/admin/cafes/pending');
  return res.data.data.cafes as AdminCafe[];
}

export async function verifyCafe(
  cafeId: string,
  status: 'verified' | 'rejected' | 'suspended',
  rejectionReason: string | null
): Promise<CafeDetail> {
  const res = await api.patch(
    `/api/v1/admin/cafes/${cafeId}/verify`,
    { status, rejectionReason }
  );
  return res.data.data.cafe as CafeDetail;
}

export async function submitPayoutDetails(data: {
  businessPan: string;
  bankAccountNumber: string;
  bankIfsc: string;
  accountHolderName: string;
}): Promise<OwnerPayoutAccount> {
  const res = await api.post('/api/v1/owner/payouts/setup', data);
  return res.data.data.payoutAccount as OwnerPayoutAccount;
}

export async function getPayoutStatus(): Promise<OwnerPayoutAccount | null> {
  const res = await api.get('/api/v1/owner/payouts/status');
  return res.data.data.payoutAccount as OwnerPayoutAccount | null;
}

export async function getBooking(bookingId: string): Promise<BookingDetail> {
  const res = await api.get(`/api/v1/bookings/${bookingId}`);
  return res.data.data.booking as BookingDetail;
}

export async function cancelBooking(bookingId: string, reason?: string): Promise<BookingDetail> {
  const res = await api.post(`/api/v1/bookings/${bookingId}/cancel`, { reason });
  return res.data.data.booking as BookingDetail;
}

export async function createPaymentOrder(bookingId: string): Promise<{ orderId: string; amount: number; currency: string }> {
  const res = await api.post('/api/v1/payments/create-order', { bookingId });
  return res.data.data;
}

export async function verifyPayment(data: {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<Record<string, unknown>> {
  const res = await api.post('/api/v1/payments/verify', data);
  return res.data.data;
}

export async function listOwnerBookings(params: {
  cafeId?: string;
  status?: string;
  date?: string;
  page?: number;
  limit?: number;
} = {}): Promise<ListBookingsResponse> {
  const res = await api.get('/api/v1/owner/bookings', { params });
  const data = res.data.data;
  return {
    bookings: data.bookings || data.items || [],
    total: data.total || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 20,
    totalPages: data.totalPages || 0,
  };
}

export async function updateOwnerBookingStatus(
  bookingId: string,
  status: string
): Promise<BookingDetail> {
  const res = await api.patch(`/api/v1/owner/bookings/${bookingId}/status`, { status });
  return res.data.data.booking as BookingDetail;
}

export async function checkinBooking(bookingId: string): Promise<BookingDetail> {
  const res = await api.post(`/api/v1/owner/bookings/${bookingId}/checkin`);
  return res.data.data.booking as BookingDetail;
}

export async function emergencyCloseCafe(cafeId: string, date: string): Promise<Record<string, unknown>> {
  const res = await api.post(`/api/v1/owner/cafes/${cafeId}/emergency-close`, null, {
    params: { date }
  });
  return res.data.data;
}

export async function createStaff(data: {
  email: string;
  fullName: string;
  password: string;
  phoneNumber?: string;
}): Promise<User> {
  const res = await api.post('/api/v1/owner/staff', data);
  return res.data.data.staff as User;
}

export async function listStaff(): Promise<User[]> {
  const res = await api.get('/api/v1/owner/staff');
  return res.data.data.staff as User[];
}

export default api;
