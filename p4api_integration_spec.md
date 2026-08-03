# KHEL-O — Complete API Integration Specification

**Sourced from**: Direct analysis of all backend endpoint files, Pydantic schemas, and service logic  
**Backend stack**: FastAPI + PostgreSQL, Pydantic v2 with `alias_generator=to_camel`  
**Date**: 2026-08-02

> [!IMPORTANT]
> Every field name in this document is verified against the backend Pydantic schemas.
> All response field names are **camelCase** (alias_generator applies on serialisation).
> All request body fields must also be sent as **camelCase** where the schema uses `populate_by_name=True`.

---

## SECTION 1: HTTP CLIENT SPECIFICATION

### 1.1 Axios Instance Configuration

**File**: `src/lib/api/client.ts`

```ts
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});
```

### 1.2 Error Type Hierarchy

```ts
// src/lib/api/errors.ts

/**
 * All errors thrown by API functions are instances of ApiError.
 * Network errors (no response) still produce an ApiError with status 0.
 */
export class ApiError extends Error {
  /** HTTP status code. 0 = network error (no response from server). */
  readonly status: number;
  /**
   * Machine-readable error code from the backend, e.g. "TIER_FULLY_BOOKED".
   * Undefined when the error is a network/timeout failure.
   */
  readonly code: string | undefined;
  /** Human-readable message safe to display to the user. */
  readonly message: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message;
  }
}

/**
 * Known backend error codes for exhaustive switch handling in the UI.
 */
export const API_ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  // Booking
  INVALID_START_TIME: 'INVALID_START_TIME',
  TIER_FULLY_BOOKED: 'TIER_FULLY_BOOKED',
  PROMOTION_EXHAUSTED: 'PROMOTION_EXHAUSTED',
  INVALID_BOOKING_STATUS: 'INVALID_BOOKING_STATUS',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  // Payment
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  OWNER_KYC_INCOMPLETE: 'OWNER_KYC_INCOMPLETE',
  // Café
  CAFE_NOT_FOUND: 'CAFE_NOT_FOUND',
  // Tier
  TIER_NOT_FOUND: 'TIER_NOT_FOUND',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_SEATS: 'INVALID_SEATS',
  // General
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Type guard — use this to handle ApiError specifically without
 * catching all errors silently.
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
```

### 1.3 Request Interceptor — Token Injection

```ts
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);
```

### 1.4 Response Interceptor — Envelope Unwrap + Error Normalisation + 401 Refresh Queue

```ts
// Tracks whether a refresh is in flight to prevent parallel refresh calls.
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function flushQueue(error: unknown, token: string | null) {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  // Success: unwrap the envelope — callers receive res.data.data directly.
  // NOTE: Individual API functions extract the specific key (e.g. data.cafe,
  // data.booking) — the interceptor only unwraps the outer { success, data } shell.
  (response: AxiosResponse) => response,

  async (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // ── 401 Refresh Flow ────────────────────────────────────────────────────
    const isAuthEndpoint =
      original.url?.includes('/auth/login') ||
      original.url?.includes('/auth/register') ||
      original.url?.includes('/auth/refresh');

    if (
      error.response?.status === 401 &&
      !original._retry &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        // Queue this request — it will be retried once the refresh resolves.
        return new Promise<AxiosResponse>((resolve, reject) => {
          pendingQueue.push({
            resolve: (token) => {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(original));
            },
            reject,
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== 'undefined'
          ? localStorage.getItem('refreshToken')
          : null;

      if (!refreshToken) {
        clearAuthAndRedirect();
        return Promise.reject(normaliseError(error));
      }

      try {
        const res = await axios.post<{
          success: boolean;
          data: { accessToken: string; refreshToken: string };
        }>(`${API_URL}/api/v1/auth/refresh`, { refreshToken });

        const newAccess = res.data.data.accessToken;
        const newRefresh = res.data.data.refreshToken;

        localStorage.setItem('accessToken', newAccess);
        localStorage.setItem('refreshToken', newRefresh);
        apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;

        flushQueue(null, newAccess);
        original.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient(original);
      } catch (refreshError) {
        flushQueue(refreshError, null);
        clearAuthAndRedirect();
        return Promise.reject(normaliseError(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normaliseError(error));
  },
);

function clearAuthAndRedirect() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}

/**
 * Converts any thrown value into a typed ApiError.
 * Extracts the backend error code and message from the response envelope.
 */
function normaliseError(err: unknown): ApiError {
  if (err instanceof AxiosError && err.response) {
    const data = err.response.data as {
      error?: { code?: string; message?: string };
      detail?: string;
    };
    const code = data?.error?.code;
    const message =
      data?.error?.message ??
      data?.detail ??
      'An unexpected error occurred.';
    return new ApiError(message, err.response.status, code);
  }
  if (err instanceof AxiosError && !err.response) {
    return new ApiError(
      'Network error — please check your connection.',
      0,
      undefined,
    );
  }
  if (err instanceof ApiError) return err;
  return new ApiError('An unexpected error occurred.', 0, undefined);
}
```

### 1.5 Typed API Helper

Every domain API function uses this helper to call the client and get
the typed inner data object:

```ts
/**
 * Makes a typed API call and returns res.data.data.
 * Throws ApiError on any non-2xx response or network failure.
 */
export async function call<T>(
  fn: () => Promise<AxiosResponse<{ success: boolean; data: T }>>,
): Promise<T> {
  const res = await fn();
  return res.data.data;
}
```

---

## SECTION 2: COMPLETE FUNCTION SIGNATURES

All functions are in `src/lib/api/` split by domain file.

### 2.1 Auth — `src/lib/api/auth.ts`

```ts
import { apiClient, call } from './client';
import type {
  User,
  AuthTokens,
  RegisterRequest,
  LoginRequest,
} from '@/types';

/**
 * Register a new user. Role defaults to 'gamer'.
 * Returns user object and token pair.
 */
export async function register(
  body: RegisterRequest,
): Promise<AuthTokens & { user: User }> {
  return call(() =>
    apiClient.post('/api/v1/auth/register', body),
  );
}

/**
 * Email + password login.
 * Returns user object and token pair.
 */
export async function login(
  body: LoginRequest,
): Promise<AuthTokens & { user: User }> {
  return call(() =>
    apiClient.post('/api/v1/auth/login', body),
  );
}

/**
 * Exchange a valid refresh token for a new access + refresh token pair.
 * Called automatically by the interceptor — do NOT call manually.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<AuthTokens> {
  return call(() =>
    apiClient.post('/api/v1/auth/refresh', { refreshToken }),
  );
}

/**
 * Fetch the authenticated user's profile.
 * The interceptor handles token injection automatically.
 */
export async function getMe(): Promise<{ user: User }> {
  return call(() => apiClient.get('/api/v1/auth/me'));
}
```

### 2.2 Cafés — `src/lib/api/cafes.ts`

```ts
import { apiClient, call } from './client';
import type {
  CafeListItem,
  CafeDetail,
  PaginatedResponse,
  CafeCreateRequest,
  CafeUpdateRequest,
  CafeListParams,
} from '@/types';

/**
 * List verified + active cafés with optional filters.
 * No auth required (public endpoint).
 * Supports both `query` and `q` params — use `query`.
 * Also supports `amenities` as a multi-value array param.
 */
export async function listCafes(
  params: CafeListParams,
): Promise<PaginatedResponse<CafeListItem>> {
  return call(() =>
    apiClient.get('/api/v1/cafes', { params }),
  );
}

/**
 * Get full café detail including tiers, activePromotions, recentReviews.
 * No auth required (public endpoint — uses get_optional_user dep).
 */
export async function getCafe(cafeId: string): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.get(`/api/v1/cafes/${cafeId}`));
}

/**
 * Create a new café. Any authenticated user can call this.
 * SIDE EFFECT: If the caller's role is 'gamer', the backend upgrades
 * it to 'cafe_owner' in the same transaction. The frontend JWT will NOT
 * reflect this change — see Section 6, Edge Case 6.
 */
export async function createCafe(
  body: CafeCreateRequest,
): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.post('/api/v1/cafes', body));
}

/**
 * Update a café's details. Auth: cafe_owner of that café only.
 */
export async function updateCafe(
  cafeId: string,
  body: CafeUpdateRequest,
): Promise<{ cafe: CafeDetail }> {
  return call(() => apiClient.patch(`/api/v1/cafes/${cafeId}`, body));
}
```

### 2.3 Hardware Tiers — `src/lib/api/tiers.ts`

```ts
import { apiClient, call } from './client';
import type {
  HardwareTier,
  TierCreateRequest,
  TierUpdateRequest,
} from '@/types';

/**
 * List active hardware tiers for a café.
 * Each tier includes an `activePromotion` object if a promotion applies.
 * No auth required.
 */
export async function listCafeTiers(
  cafeId: string,
): Promise<{ tiers: HardwareTier[] }> {
  return call(() =>
    apiClient.get(`/api/v1/cafes/${cafeId}/tiers`),
  );
}

/**
 * Get a single hardware tier by ID.
 * Route: GET /api/v1/hardware-tiers/{tierId}
 * No auth required.
 */
export async function getTier(tierId: string): Promise<{ hardwareTier: HardwareTier }> {
  return call(() =>
    apiClient.get(`/api/v1/hardware-tiers/${tierId}`),
  );
}

/**
 * Create a new hardware tier for a café.
 * Auth: cafe_owner of that café.
 * Returns key `hardwareTier` (not `tier`).
 * Backend validates: appBookableSeats <= totalSeats, pricePerHour > 0.
 * May return a `warning` field if specs are below preset minimums.
 */
export async function createTier(
  cafeId: string,
  body: TierCreateRequest,
): Promise<{ hardwareTier: HardwareTier }> {
  return call(() =>
    apiClient.post(`/api/v1/cafes/${cafeId}/tiers`, body),
  );
}

/**
 * Update a hardware tier. Auth: cafe_owner of that café.
 * Returns key `hardwareTier` (not `tier`).
 */
export async function updateTier(
  cafeId: string,
  tierId: string,
  body: TierUpdateRequest,
): Promise<{ hardwareTier: HardwareTier }> {
  return call(() =>
    apiClient.patch(`/api/v1/cafes/${cafeId}/tiers/${tierId}`, body),
  );
}
```

### 2.4 Bookings — `src/lib/api/bookings.ts`

```ts
import { apiClient, call } from './client';
import type {
  BookingDetail,
  BookingCreateRequest,
  BookingListParams,
  PaginatedResponse,
} from '@/types';

/**
 * Create a new booking (pending_payment status).
 * Auth: gamer only (require_gamer dep).
 * Throws TIER_FULLY_BOOKED, INVALID_START_TIME, PROMOTION_EXHAUSTED.
 * sessionDate: "YYYY-MM-DD", startTime: "HH:MM:SS", durationHours: 0.5–8.
 */
export async function createBooking(
  body: BookingCreateRequest,
): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.post('/api/v1/bookings', body));
}

/**
 * List bookings for the current user.
 * Auth: any active user. Gamers see their own. Owners see their venue bookings.
 * The same endpoint returns different data based on JWT role.
 */
export async function listBookings(
  params: BookingListParams = {},
): Promise<PaginatedResponse<BookingDetail>> {
  return call(() => apiClient.get('/api/v1/bookings', { params }));
}

/**
 * Get a single booking's full detail including qrCodeUrl.
 * Auth: gamer (own bookings) or cafe_owner (their venue's bookings).
 */
export async function getBooking(
  bookingId: string,
): Promise<{ booking: BookingDetail }> {
  return call(() => apiClient.get(`/api/v1/bookings/${bookingId}`));
}

/**
 * Cancel a booking. Auth: the gamer who made it.
 * Business rule: >2h before session = full refund, <2h = no refund.
 * reason is optional.
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string,
): Promise<{ booking: BookingDetail }> {
  return call(() =>
    apiClient.post(`/api/v1/bookings/${bookingId}/cancel`, { reason }),
  );
}
```

### 2.5 Payments — `src/lib/api/payments.ts`

```ts
import { apiClient, call } from './client';
import type { PaymentOrder, PaymentVerifyRequest, PaymentVerifyResponse } from '@/types';

/**
 * Create a Razorpay order for a pending_payment booking.
 * Auth: the gamer who owns the booking.
 * Returns razorpayOrderId (not orderId), amount in INR (NOT paise), currency, keyId.
 * Throws INVALID_BOOKING_STATUS if booking is not pending_payment.
 * Throws OWNER_KYC_INCOMPLETE if Route split is enabled and owner KYC is pending.
 * Idempotent: returns existing order if one already exists for the booking.
 */
export async function createPaymentOrder(
  bookingId: string,
): Promise<PaymentOrder> {
  return call(() =>
    apiClient.post('/api/v1/payments/create-order', { bookingId }),
  );
}

/**
 * Verify a Razorpay payment after the checkout modal closes.
 * Auth: the gamer who owns the booking.
 * SIDE EFFECT: On success, backend generates a QR code and updates
 * booking status to 'confirmed'. The qrCodeUrl is available on
 * subsequent GET /api/v1/bookings/{id} calls.
 * Throws INVALID_SIGNATURE if the HMAC does not match.
 */
export async function verifyPayment(
  body: PaymentVerifyRequest,
): Promise<PaymentVerifyResponse> {
  return call(() => apiClient.post('/api/v1/payments/verify', body));
}
```

### 2.6 Promotions — `src/lib/api/promotions.ts`

```ts
import { apiClient, call } from './client';
import type {
  Promotion,
  PromotionCreateRequest,
  PromotionUpdateRequest,
} from '@/types';

/**
 * Get active promotions for a café.
 * No auth required.
 * Returns key `promotions` (array).
 */
export async function listCafePromotions(
  cafeId: string,
): Promise<{ promotions: Promotion[] }> {
  return call(() =>
    apiClient.get(`/api/v1/promotions/cafe/${cafeId}`),
  );
}

/**
 * Get a single promotion by ID. No auth required.
 */
export async function getPromotion(
  promotionId: string,
): Promise<{ promotion: Promotion }> {
  return call(() =>
    apiClient.get(`/api/v1/promotions/${promotionId}`),
  );
}

/**
 * Create a promotion. Auth: cafe_owner of the target café.
 */
export async function createPromotion(
  body: PromotionCreateRequest,
): Promise<{ promotion: Promotion }> {
  return call(() => apiClient.post('/api/v1/promotions', body));
}

/**
 * Update a promotion's fields. Auth: cafe_owner.
 */
export async function updatePromotion(
  promotionId: string,
  body: PromotionUpdateRequest,
): Promise<{ promotion: Promotion }> {
  return call(() =>
    apiClient.patch(`/api/v1/promotions/${promotionId}`, body),
  );
}

/**
 * Deactivate (soft-delete) a promotion.
 * Auth: cafe_owner.
 * Returns { success: true, message: "Promotion deactivated successfully" }
 * — no data payload.
 */
export async function deletePromotion(promotionId: string): Promise<void> {
  await apiClient.delete(`/api/v1/promotions/${promotionId}`);
}
```

### 2.7 Reviews — `src/lib/api/reviews.ts`

```ts
import { apiClient, call } from './client';
import type { Review, ReviewCreateRequest, PaginatedResponse } from '@/types';

/**
 * Submit a review for a completed booking.
 * Auth: gamer only. One review per completed booking.
 * bookingId links the review to a specific completed session.
 */
export async function createReview(
  body: ReviewCreateRequest,
): Promise<{ review: Review }> {
  return call(() => apiClient.post('/api/v1/reviews', body));
}

/**
 * List visible reviews for a café with pagination.
 * No auth required.
 * Returns paginated list (items, total, page, pageSize, totalPages).
 */
export async function listCafeReviews(
  cafeId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<Review>> {
  return call(() =>
    apiClient.get(`/api/v1/reviews/cafe/${cafeId}`, { params }),
  );
}
```

### 2.8 Owner — `src/lib/api/owner.ts`

```ts
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

/**
 * Get owner dashboard KPIs.
 * Auth: cafe_owner only.
 * Returns: totalCafes, totalBookingsThisMonth, revenueThisMonth,
 * upcomingBookingsToday, occupancyRateThisWeek, mostPopularTier.
 */
export async function getOwnerDashboard(): Promise<OwnerDashboard> {
  return call(() => apiClient.get('/api/v1/owner/dashboard'));
}

/**
 * List bookings for the owner's venue(s).
 * Auth: cafe_owner or staff (require_staff_or_owner dep).
 * Returns enriched booking items: gamerName, tierName, cafeName included.
 * Supports filtering by cafeId, status, date (ISO date string YYYY-MM-DD).
 */
export async function listOwnerBookings(
  params: OwnerBookingParams = {},
): Promise<OwnerBookingListResponse> {
  return call(() =>
    apiClient.get('/api/v1/owner/bookings', { params }),
  );
}

/**
 * Update a booking's status from the owner side.
 * Auth: cafe_owner or staff.
 * Valid status values: 'completed' | 'no_show'
 */
export async function updateOwnerBookingStatus(
  bookingId: string,
  status: 'completed' | 'no_show',
): Promise<{ booking: BookingDetail }> {
  return call(() =>
    apiClient.patch(`/api/v1/owner/bookings/${bookingId}/status`, { status }),
  );
}

/**
 * Check in a gamer via their booking ID (manual check-in, not QR scan).
 * Auth: cafe_owner or staff.
 * Updates booking status to 'checked_in'.
 */
export async function checkinBooking(
  bookingId: string,
): Promise<{ booking: BookingDetail }> {
  return call(() =>
    apiClient.post(`/api/v1/owner/bookings/${bookingId}/checkin`),
  );
}

/**
 * Emergency close a café for a specific date.
 * Cancels all bookings for that date.
 * Auth: cafe_owner only.
 * date param: ISO date string "YYYY-MM-DD" sent as a query param.
 */
export async function emergencyCloseCafe(
  cafeId: string,
  date: string,
): Promise<{ cancelledBookings: number }> {
  return call(() =>
    apiClient.post(
      `/api/v1/owner/cafes/${cafeId}/emergency-close`,
      null,
      { params: { date } },
    ),
  );
}

/**
 * Create a staff user for the owner's café.
 * Auth: cafe_owner only.
 * The created user has role 'staff' and is immediately active.
 * Note: staff users are NOT scoped to a specific café in the DB — they
 * see all bookings for the owner's venues via require_staff_or_owner dep.
 */
export async function createStaff(body: {
  email: string;
  fullName: string;
  password: string;
  phoneNumber?: string;
}): Promise<{ staff: User }> {
  return call(() => apiClient.post('/api/v1/owner/staff', body));
}

/**
 * List all staff users (globally, not scoped per café).
 * Auth: cafe_owner only.
 */
export async function listStaff(): Promise<{ staff: User[] }> {
  return call(() => apiClient.get('/api/v1/owner/staff'));
}

/**
 * Get payout account status for the current owner.
 * Auth: cafe_owner only.
 * Returns null payoutAccount if no account has been set up yet.
 */
export async function getPayoutStatus(): Promise<{
  payoutAccount: OwnerPayoutAccount | null;
}> {
  return call(() => apiClient.get('/api/v1/owner/payouts/status'));
}

/**
 * Submit KYC + bank account details for payout setup.
 * Auth: cafe_owner only.
 */
export async function setupPayout(
  body: PayoutSetupRequest,
): Promise<{ payoutAccount: OwnerPayoutAccount }> {
  return call(() =>
    apiClient.post('/api/v1/owner/payouts/setup', body),
  );
}
```

### 2.9 Admin — `src/lib/api/admin.ts`

```ts
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
} from '@/types';

/** Get platform-wide analytics. Auth: admin only. */
export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  return call(() => apiClient.get('/api/v1/admin/analytics'));
}

/**
 * List all cafés with admin-level detail.
 * Auth: admin only.
 * Supports filtering: verificationStatus, city, isActive.
 */
export async function listAdminCafes(
  params: AdminCafeListParams = {},
): Promise<PaginatedResponse<AdminCafe>> {
  return call(() =>
    apiClient.get('/api/v1/admin/cafes', { params }),
  );
}

/**
 * List cafés with verificationStatus = 'pending'.
 * Auth: admin only.
 * This is the primary queue endpoint for the admin portal.
 */
export async function listPendingCafes(
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<AdminCafe>> {
  return call(() =>
    apiClient.get('/api/v1/admin/cafes/pending', { params }),
  );
}

/**
 * Get a single café's admin-level detail including owner info.
 * Auth: admin only.
 * Returns { cafe, owner } — two separate objects.
 */
export async function getAdminCafe(
  cafeId: string,
): Promise<{ cafe: CafeDetail; owner: User }> {
  return call(() => apiClient.get(`/api/v1/admin/cafes/${cafeId}`));
}

/**
 * Verify, reject, or suspend a café.
 * Auth: admin only.
 * SIDE EFFECT on 'verified': backend also upgrades owner's role to cafe_owner.
 * reason is required when status is 'rejected' or 'suspended'.
 */
export async function verifyCafe(
  cafeId: string,
  body: AdminCafeVerifyRequest,
): Promise<{ cafe: CafeDetail }> {
  return call(() =>
    apiClient.patch(`/api/v1/admin/cafes/${cafeId}/verify`, body),
  );
}

/** List all users with optional filters. Auth: admin only. */
export async function listAdminUsers(
  params: {
    role?: string;
    isActive?: boolean;
    email?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<PaginatedResponse<User>> {
  return call(() =>
    apiClient.get('/api/v1/admin/users', { params }),
  );
}

/** Deactivate a user account. Auth: admin only. */
export async function deactivateUser(
  userId: string,
): Promise<{ user: User }> {
  return call(() =>
    apiClient.patch(`/api/v1/admin/users/${userId}/deactivate`),
  );
}

/** Activate a user account. Auth: admin only. */
export async function activateUser(
  userId: string,
): Promise<{ user: User }> {
  return call(() =>
    apiClient.patch(`/api/v1/admin/users/${userId}/activate`),
  );
}

/** Change a user's role. Auth: admin only. */
export async function changeUserRole(
  userId: string,
  role: UserRole,
): Promise<{ user: User }> {
  return call(() =>
    apiClient.patch(`/api/v1/admin/users/${userId}/role`, { role }),
  );
}

/** List all bookings with full admin filters. Auth: admin only. */
export async function listAdminBookings(
  params: AdminBookingListParams = {},
): Promise<PaginatedResponse<BookingDetail>> {
  return call(() =>
    apiClient.get('/api/v1/admin/bookings', { params }),
  );
}

/** Deactivate a promotion platform-wide. Auth: admin only. */
export async function deactivatePromotion(
  promotionId: string,
): Promise<{ promotion: Promotion }> {
  return call(() =>
    apiClient.patch(
      `/api/v1/admin/promotions/${promotionId}/deactivate`,
    ),
  );
}

/** Toggle review visibility. Auth: admin only. */
export async function setReviewVisibility(
  reviewId: string,
  isVisible: boolean,
): Promise<{ review: Review }> {
  return call(() =>
    apiClient.patch(`/api/v1/admin/reviews/${reviewId}/visibility`, {
      isVisible,
    }),
  );
}
```

---

## SECTION 3: COMPLETE TYPE DEFINITIONS

**File**: `src/types/` — split by domain, re-exported from `src/types/index.ts`

### 3.1 Enums

```ts
// src/types/enums.ts

export type UserRole = 'gamer' | 'cafe_owner' | 'staff' | 'admin';

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'suspended';

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'checked_in';

export type PaymentStatus =
  | 'created'
  | 'captured'
  | 'failed'
  | 'refunded';

export type KycStatus =
  | 'pending'
  | 'submitted'
  | 'activated'
  | 'suspended'
  | 'rejected';

export type PresetCategory =
  | 'esports_starter'
  | 'pro_gaming'
  | 'ultra_streamer';
```

### 3.2 Shared Sub-Types

```ts
// src/types/shared.ts

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Specs object stored as a free-form Record in the DB */
export interface TierSpecs {
  gpu?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  monitor?: string;
  peripherals?: string;
  [key: string]: string | undefined;
}
```

### 3.3 User Types

```ts
// src/types/user.ts

import type { UserRole } from './enums';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
```

### 3.4 Café Types

```ts
// src/types/cafe.ts

import type { VerificationStatus } from './enums';
import type { HardwareTier } from './tier';
import type { Promotion } from './promotion';
import type { Review } from './review';

export interface CafeListItem {
  id: string;
  name: string;
  city: string;
  state: string;
  averageRating: number;
  totalReviews: number;
  /** null if no tiers defined */
  startingPrice: number | null;
  tierNames: string[];
  photos: string[];
  hasActivePromotion: boolean;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  totalSeats: number | null;
}

export interface Cafe {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string | null;
  phoneNumber: string | null;
  email: string | null;
  openingTime: string | null;   // "HH:MM:SS"
  closingTime: string | null;   // "HH:MM:SS"
  totalSeats: number | null;
  verificationStatus: VerificationStatus;
  amenities: string[];
  photos: string[];
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CafeDetail extends Cafe {
  averageRating: number;
  totalReviews: number;
  tiers: HardwareTier[];
  activePromotions: Promotion[];
  recentReviews: Review[];
}

/** Returned by GET /api/v1/admin/cafes/{id} */
export interface AdminCafe extends CafeDetail {
  owner: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
  };
}

export interface CafeListParams {
  city?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  page?: number;
  limit?: number;
}

export interface CafeCreateRequest {
  name: string;
  description?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode?: string;
  phoneNumber?: string;
  email?: string;
  openingTime?: string;   // "HH:MM:SS"
  closingTime?: string;   // "HH:MM:SS"
  totalSeats?: number;
  amenities?: string[];
  photos?: string[];
}

export type CafeUpdateRequest = Partial<CafeCreateRequest>;

export interface AdminCafeListParams {
  verificationStatus?: VerificationStatus;
  city?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface AdminCafeVerifyRequest {
  status: 'verified' | 'rejected' | 'suspended';
  /** Required when status is 'rejected' or 'suspended'. */
  reason?: string;
}
```

### 3.5 Hardware Tier Types

```ts
// src/types/tier.ts

import type { PresetCategory } from './enums';
import type { TierSpecs } from './shared';
import type { Promotion } from './promotion';

export interface HardwareTier {
  id: string;
  cafeId: string;
  name: string;
  description: string | null;
  specs: TierSpecs;
  totalSeats: number;
  appBookableSeats: number;
  activeSeatsCount: number;
  presetCategory: PresetCategory | null;
  /** Computed by backend from specs. Not stored in DB. */
  performanceRating: number | null;
  /** Populated when specs fall below preset minimums. */
  warning: string | null;
  pricePerHour: number;
  isActive: boolean;
  /** Populated when listing tiers via GET /cafes/{id}/tiers */
  activePromotion: Promotion | null;
  createdAt: string;
  updatedAt: string;
}

export interface TierCreateRequest {
  name: string;
  description?: string;
  specs: TierSpecs;
  totalSeats: number;
  appBookableSeats: number;
  presetCategory?: PresetCategory | null;
  pricePerHour: number;
}

export type TierUpdateRequest = Partial<TierCreateRequest> & {
  isActive?: boolean;
  activeSeatCount?: number;
};
```

### 3.6 Booking Types

```ts
// src/types/booking.ts

import type { BookingStatus } from './enums';

export interface Booking {
  id: string;
  bookingReference: string;
  gamerId: string;
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;   // "YYYY-MM-DD"
  startTime: string;     // "HH:MM:SS"
  endTime: string;       // "HH:MM:SS"
  durationHours: number;
  baseAmount: number;
  discountAmount: number;
  gatewayFee: number;
  totalAmount: number;
  status: BookingStatus;
  promotionId: string | null;
  qrCodeUrl: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Returned by GET /api/v1/bookings and GET /api/v1/bookings/{id} */
export interface BookingDetail extends Booking {
  cafeName: string | null;
  tierName: string | null;
  cafeAddress: string | null;
}

/**
 * Returned by GET /api/v1/owner/bookings.
 * Includes gamerName unlike the gamer-side BookingDetail.
 */
export interface OwnerBookingItem extends Booking {
  gamerName: string;
  tierName: string;
  cafeName: string;
}

export interface BookingCreateRequest {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;    // "YYYY-MM-DD"
  startTime: string;      // "HH:MM:SS"
  durationHours: number;  // 0.5 to 8.0
  promotionId?: string;
  notes?: string;
}

export interface BookingListParams {
  page?: number;
  limit?: number;
  status?: BookingStatus;
}

export interface OwnerBookingParams {
  cafeId?: string;
  status?: string;
  date?: string;          // "YYYY-MM-DD"
  page?: number;
  limit?: number;
}

export interface OwnerBookingListResponse {
  items: OwnerBookingItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminBookingListParams {
  cafeId?: string;
  gamerId?: string;
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
```

### 3.7 Payment Types

```ts
// src/types/payment.ts

import type { PaymentStatus } from './enums';

/**
 * Returned by POST /api/v1/payments/create-order.
 * IMPORTANT: amount is in INR (whole rupees), NOT paise.
 * The Razorpay SDK requires paise, so multiply by 100 before passing to SDK.
 */
export interface PaymentOrder {
  razorpayOrderId: string;
  amount: number;         // INR — multiply × 100 for Razorpay SDK
  currency: string;       // "INR"
  keyId: string;          // Razorpay public key
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
```

### 3.8 Promotion Types

```ts
// src/types/promotion.ts

export interface Promotion {
  id: string;
  cafeId: string;
  title: string;
  description: string | null;
  discountPercentage: number;
  applicableTierId: string | null;
  /** Tier name string for display — not a foreign key join. */
  applicableTierName: string | null;
  validFrom: string;      // ISO date string
  validUntil: string;     // ISO date string
  daysOfWeek: number[];   // 0=Sunday, 6=Saturday
  startHour: number;      // 0–23
  endHour: number;        // 0–23
  maxUses: number | null;
  currentUses: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCreateRequest {
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
}

export type PromotionUpdateRequest = Partial<Omit<PromotionCreateRequest, 'cafeId'>> & {
  isActive?: boolean;
};
```

### 3.9 Review Types

```ts
// src/types/review.ts

export interface Review {
  id: string;
  cafeId: string;
  gamerId: string;
  bookingId: string;
  gamerName: string;
  rating: number;         // 1–5
  comment: string | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCreateRequest {
  bookingId: string;
  rating: number;         // 1–5
  comment?: string;
}
```

### 3.10 Owner & Admin Types

```ts
// src/types/owner.ts

import type { KycStatus } from './enums';

export interface OwnerDashboard {
  totalCafes: number;
  totalBookingsThisMonth: number;
  revenueThisMonth: number;
  upcomingBookingsToday: number;
  occupancyRateThisWeek: number;
  mostPopularTier: string | null;
}

export interface OwnerPayoutAccount {
  id: string;
  ownerId: string;
  razorpayAccountId: string | null;
  kycStatus: KycStatus;
  businessPan: string | null;
  bankAccountNumberMasked: string | null;
  bankIfsc: string | null;
  accountHolderName: string | null;
  submittedAt: string | null;
}

export interface PayoutSetupRequest {
  businessPan: string;
  bankAccountNumber: string;
  bankIfsc: string;
  accountHolderName: string;
}

// src/types/admin.ts

export interface AdminAnalytics {
  totalUsers: number;
  totalCafes: number;
  totalBookings: number;
  totalRevenue: number;
  pendingCafes: number;
  activePromotions: number;
  // Additional fields returned by the service as available
  [key: string]: number;
}
```

---

## SECTION 4: TANSTACK QUERY INTEGRATION SPEC

### 4.1 Query Key Factory

```ts
// src/hooks/queries/keys.ts

export const queryKeys = {
  // ── Auth ──────────────────────────────────────────────
  me: ['auth', 'me'] as const,

  // ── Cafés ─────────────────────────────────────────────
  cafes: {
    all: ['cafes'] as const,
    list: (params: CafeListParams) =>
      ['cafes', 'list', params] as const,
    detail: (id: string) =>
      ['cafes', 'detail', id] as const,
    tiers: (cafeId: string) =>
      ['cafes', 'tiers', cafeId] as const,
  },

  // ── Bookings ──────────────────────────────────────────
  bookings: {
    all: ['bookings'] as const,
    list: (params: BookingListParams) =>
      ['bookings', 'list', params] as const,
    detail: (id: string) =>
      ['bookings', 'detail', id] as const,
  },

  // ── Promotions ────────────────────────────────────────
  promotions: {
    byCafe: (cafeId: string) =>
      ['promotions', 'cafe', cafeId] as const,
    detail: (id: string) =>
      ['promotions', 'detail', id] as const,
  },

  // ── Reviews ───────────────────────────────────────────
  reviews: {
    byCafe: (cafeId: string, params: object) =>
      ['reviews', 'cafe', cafeId, params] as const,
  },

  // ── Owner ─────────────────────────────────────────────
  owner: {
    dashboard: ['owner', 'dashboard'] as const,
    bookings: (params: OwnerBookingParams) =>
      ['owner', 'bookings', params] as const,
    staff: ['owner', 'staff'] as const,
    payoutStatus: ['owner', 'payout', 'status'] as const,
  },

  // ── Admin ─────────────────────────────────────────────
  admin: {
    analytics: ['admin', 'analytics'] as const,
    pendingCafes: (params: object) =>
      ['admin', 'cafes', 'pending', params] as const,
    allCafes: (params: AdminCafeListParams) =>
      ['admin', 'cafes', 'all', params] as const,
    cafeDetail: (id: string) =>
      ['admin', 'cafes', 'detail', id] as const,
    users: (params: object) =>
      ['admin', 'users', params] as const,
    bookings: (params: AdminBookingListParams) =>
      ['admin', 'bookings', params] as const,
  },
} as const;
```

### 4.2 Stale Time Table

| Query | Stale Time | Rationale |
|-------|-----------|-----------|
| `auth/me` | 5 min | User data changes rarely mid-session |
| `cafes.list` | 30 sec | Listings update frequently (new cafés, status changes) |
| `cafes.detail` | 60 sec | Reviews, ratings, and tiers change moderately |
| `cafes.tiers` | 60 sec | Tier prices change only via owner action |
| `bookings.list` | 0 (always fresh) | Booking status changes are critical to show accurately |
| `bookings.detail` | 0 (always fresh) | QR code URL must always be current |
| `promotions.byCafe` | 30 sec | Promotions expire on time-based rules |
| `reviews.byCafe` | 5 min | Reviews are slow-moving |
| `owner.dashboard` | 30 sec | KPIs should be live on the dashboard |
| `owner.bookings` | 0 (always fresh) | Staff check-in requires current data |
| `owner.staff` | 5 min | Staff list rarely changes |
| `owner.payoutStatus` | 5 min | KYC status changes are external events |
| `admin.pendingCafes` | 0 (always fresh) | Admin queue must be live |
| `admin.analytics` | 60 sec | Platform stats are aggregate/slow |

### 4.3 Query Definitions by Screen

```ts
// ── Explore Page ─────────────────────────────────────────────────────────
// useListCafes.ts
useQuery({
  queryKey: queryKeys.cafes.list(params),
  queryFn: () => listCafes(params),
  staleTime: 30_000,
  placeholderData: keepPreviousData,   // TanStack v5 API
})

// ── Café Detail Page ────────────────────────────────────────────────────
// useCafeDetail.ts
useQuery({
  queryKey: queryKeys.cafes.detail(cafeId),
  queryFn: () => getCafe(cafeId).then(d => d.cafe),
  staleTime: 60_000,
  enabled: Boolean(cafeId),
})

// ── Booking Wizard ────────────────────────────────────────────────────────
// Reuses cafes.detail — the wizard needs café tiers, hours, promos.
// No additional query needed if detail is already in cache.

// ── Gamer Bookings List ─────────────────────────────────────────────────
useQuery({
  queryKey: queryKeys.bookings.list({ page, status }),
  queryFn: () => listBookings({ page, status }),
  staleTime: 0,
})

// ── Booking Detail / Pass ────────────────────────────────────────────────
useQuery({
  queryKey: queryKeys.bookings.detail(bookingId),
  queryFn: () => getBooking(bookingId).then(d => d.booking),
  staleTime: 0,
  enabled: Boolean(bookingId),
})

// ── Owner Dashboard ──────────────────────────────────────────────────────
useQuery({
  queryKey: queryKeys.owner.dashboard,
  queryFn: getOwnerDashboard,
  staleTime: 30_000,
  refetchInterval: 60_000,   // Auto-refresh KPIs every minute
})

// ── Owner Bookings ────────────────────────────────────────────────────────
useQuery({
  queryKey: queryKeys.owner.bookings(params),
  queryFn: () => listOwnerBookings(params),
  staleTime: 0,
  refetchInterval: 30_000,   // Auto-refresh for staff check-in
})

// ── Admin Pending Queue ───────────────────────────────────────────────────
useQuery({
  queryKey: queryKeys.admin.pendingCafes({ page }),
  queryFn: () => listPendingCafes({ page }),
  staleTime: 0,
})
```

### 4.4 Mutation Definitions + Invalidation Map

```ts
// ── createBooking ─────────────────────────────────────────────────────────
useMutation({
  mutationFn: createBooking,
  onSuccess: (data) => {
    // Newly created booking is pending_payment — no list invalidation yet.
    // The list is invalidated after payment verification.
    queryClient.setQueryData(
      queryKeys.bookings.detail(data.booking.id),
      data,
    );
  },
})

// ── verifyPayment ─────────────────────────────────────────────────────────
useMutation({
  mutationFn: verifyPayment,
  onSuccess: (_, variables) => {
    // After payment, booking moves to 'confirmed' with qrCodeUrl set.
    queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  },
})

// ── cancelBooking ─────────────────────────────────────────────────────────
useMutation({
  mutationFn: ({ id, reason }) => cancelBooking(id, reason),
  onMutate: async ({ id }) => {
    // Optimistic update: immediately mark as cancelled in the list.
    await queryClient.cancelQueries({ queryKey: queryKeys.bookings.all });
    const prev = queryClient.getQueryData(queryKeys.bookings.detail(id));
    queryClient.setQueryData(queryKeys.bookings.detail(id), (old) =>
      old ? { ...old, status: 'cancelled' } : old,
    );
    return { prev };
  },
  onError: (_, { id }, ctx) => {
    // Revert on failure.
    queryClient.setQueryData(queryKeys.bookings.detail(id), ctx?.prev);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  },
})

// ── createCafe ────────────────────────────────────────────────────────────
useMutation({
  mutationFn: createCafe,
  onSuccess: () => {
    // After creation, force-refresh /auth/me to pick up role change.
    queryClient.invalidateQueries({ queryKey: queryKeys.me });
    queryClient.invalidateQueries({ queryKey: queryKeys.cafes.all });
  },
})

// ── updateCafe ────────────────────────────────────────────────────────────
useMutation({
  mutationFn: ({ cafeId, body }) => updateCafe(cafeId, body),
  onSuccess: (data) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.cafes.detail(data.cafe.id),
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.cafes.all });
  },
})

// ── createTier / updateTier ───────────────────────────────────────────────
useMutation({
  onSuccess: (data) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.cafes.tiers(data.hardwareTier.cafeId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.cafes.detail(data.hardwareTier.cafeId),
    });
  },
})

// ── createPromotion / updatePromotion ─────────────────────────────────────
useMutation({
  onSuccess: (data) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.promotions.byCafe(data.promotion.cafeId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.cafes.detail(data.promotion.cafeId),
    });
  },
})

// ── deletePromotion ───────────────────────────────────────────────────────
useMutation({
  mutationFn: deletePromotion,
  onMutate: async (promotionId) => {
    // Optimistic: remove from list immediately.
    await queryClient.cancelQueries({ queryKey: ['promotions'] });
    // Store previous value for rollback (caller must pass cafeId for rollback).
  },
  onSettled: (_, __, ___, ctx) => {
    queryClient.invalidateQueries({ queryKey: ['promotions'] });
  },
})

// ── checkinBooking / updateOwnerBookingStatus ─────────────────────────────
useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['owner', 'bookings'] });
  },
})

// ── verifyCafe (admin) ────────────────────────────────────────────────────
useMutation({
  mutationFn: ({ cafeId, body }) => verifyCafe(cafeId, body),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'cafes'] });
  },
})
```

### 4.5 Optimistic Update Candidates

| Mutation | Optimistic? | Justification |
|----------|-------------|--------------|
| `cancelBooking` | ✅ Yes | User feedback is immediate; refund rules are clear |
| `deletePromotion` | ✅ Yes | Owner expects immediate list update |
| `setReviewVisibility` | ✅ Yes | Admin toggle should feel instant |
| `createBooking` | ❌ No | Slot availability must be server-confirmed |
| `verifyPayment` | ❌ No | Signature verification must succeed before state change |
| `verifyCafe` | ❌ No | Admin action needs server confirmation |
| `createTier` | ❌ No | Seat counts and price validation server-side |

---

## SECTION 5: ENVIRONMENT VARIABLE SPEC

```env
# src/.env.local (and .env.example)

# ── Required ──────────────────────────────────────────────────────────────

# Backend API base URL. No trailing slash.
NEXT_PUBLIC_API_URL=http://localhost:8000
# Example (Docker): http://localhost:8000
# Example (prod): https://api.khel-o.in

# Razorpay publishable key — safe to expose in frontend.
# If absent, the useRazorpay hook falls back to sandbox simulation mode.
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
# Example: rzp_test_abc123xyz456

# ── Optional ──────────────────────────────────────────────────────────────

# App URL — used for PWA manifest and canonical meta tags.
# Default: http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Example (prod): https://khel-o.in

# Comma-separated list of cities shown in filter chips on Explore.
# If absent, defaults to hardcoded list in constants.ts.
NEXT_PUBLIC_CITIES=Bengaluru,Mumbai,Pune,Delhi,Hyderabad,Chennai,Kolkata

# Analytics / error tracking DSN (optional, for production only).
# NEXT_PUBLIC_SENTRY_DSN=https://...
```

> [!CAUTION]
> Never put `RAZORPAY_KEY_SECRET` or any private key in `NEXT_PUBLIC_*` variables.
> The secret is used server-side (backend) for HMAC signature verification only.
> The frontend only holds the publishable key (`KEY_ID`).

---

## SECTION 6: EDGE CASES & INTEGRATION RISKS

### Edge Case 1: Token Expiry During Multi-Step Booking Wizard

**Scenario**: User is on Step 3 (checkout) of the booking wizard. Their access token expired 30 seconds ago. They click "Pay" — this triggers `createPaymentOrder(bookingId)` which returns 401.

**What happens**: The interceptor catches the 401, calls `/auth/refresh` with the stored refresh token, gets a new access token, and automatically retries `createPaymentOrder`. The Razorpay checkout then opens as normal.

**Frontend behaviour**: The user sees nothing unusual — the 401 → refresh → retry happens transparently in ~300ms. No wizard state is lost because state is held in `useReducer` (React memory), not the URL or localStorage.

**Risk**: If the refresh token has also expired, `clearAuthAndRedirect()` fires and the user is sent to `/login`. Their wizard state is lost. **Mitigation**: The wizard step cannot be resumed after login. The user must restart from the Café Detail page. Accept this: it is the correct tradeoff for security.

---

### Edge Case 2: PROMOTION_EXHAUSTED Mid-Flow

**Scenario**: User selects a promotion on Step 1. By the time they reach Step 3 and click "Pay", the promotion has hit `maxUses` and the backend rejects `createBooking` with `PROMOTION_EXHAUSTED`.

**Frontend behaviour**:
1. `createBooking` mutation throws `ApiError` with `code: 'PROMOTION_EXHAUSTED'`.
2. The wizard's `onError` handler checks `isApiError(err) && err.code === API_ERROR_CODES.PROMOTION_EXHAUSTED`.
3. The wizard dispatches `{ type: 'SET_COUPON', code: '' }` to clear the applied promotion.
4. An inline error banner renders: *"This offer has just expired. Your booking has been updated to the standard rate."*
5. The wizard stays on Step 3 — the user can retry `createBooking` without the promotion or go back to pick another one.
6. Do NOT navigate the user back to Step 1 automatically — that is disorienting.

```ts
// Booking wizard error handler
if (isApiError(err)) {
  switch (err.code) {
    case 'PROMOTION_EXHAUSTED':
      dispatch({ type: 'CLEAR_PROMOTION' });
      setError('This offer has just expired. Continuing without the promotion.');
      break;
    case 'TIER_FULLY_BOOKED':
      setError('This tier is fully booked for the selected slot. Please choose another time.');
      break;
    case 'INVALID_START_TIME':
      setError('This slot is no longer available. Please select a different time.');
      dispatch({ type: 'CLEAR_SLOT' });
      break;
    default:
      setError(err.message);
  }
}
```

---

### Edge Case 3: QR Code Display

**Scenario**: User navigates to `/bookings/[id]` or the post-payment confirmation screen.

**Behaviour rules**:

| `booking.status` | `booking.qrCodeUrl` | What to render |
|-----------------|---------------------|----------------|
| `confirmed` | non-null URL | `<img src={qrCodeUrl} alt="Booking QR Code" />` |
| `confirmed` | `null` | Spinner + "Generating your pass…" — poll the detail query every 5 seconds until URL appears (backend generates QR async after payment verify) |
| `pending_payment` | `null` | Do not show QR section — show "Complete payment to get your pass" |
| `cancelled` / `completed` / `no_show` | any | Show QR if URL exists (for records), else show booking reference text only |

**Implementation**:
```ts
// In BookingDetail component
const isGenerating =
  booking.status === 'confirmed' && !booking.qrCodeUrl;

useEffect(() => {
  if (!isGenerating) return;
  const interval = setInterval(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.bookings.detail(booking.id),
    });
  }, 5_000);
  return () => clearInterval(interval);
}, [isGenerating, booking.id, queryClient]);
```

**Rendering**: Always use `<img>` — not a client-side QR library. The backend generates and stores the QR image file; `qrCodeUrl` is a path to that file served by the backend static file handler.

---

### Edge Case 4: Deep Linking to Booking Detail

**Scenario**: User receives a push notification with a direct link to `/bookings/ABC123`. They tap it, opening the app cold. Auth state is not yet hydrated.

**What happens**:
1. `BookingDetail` page renders inside `(customer)` route group.
2. The customer layout's `AuthGuard` checks `isHydrated`.
3. While `!isHydrated`: render the loading spinner — do NOT render the page content or redirect.
4. `initializeFromStorage()` runs (called in `providers.tsx`), reads tokens from localStorage, calls `/auth/me`.
5. Once `isHydrated = true`: if authenticated → page renders and `useQuery` fires for the booking. If not authenticated → redirect to `/login?redirect=/bookings/ABC123`.

**Redirect preservation**:
```ts
// In AuthGuard component
if (isHydrated && !isAuthenticated) {
  router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
}

// In login page, after successful login:
const redirect = searchParams.get('redirect');
router.push(redirect ?? '/');
```

---

### Edge Case 5: Owner vs Gamer Booking Views

**Scenario**: Both gamers and owners call `GET /api/v1/bookings`. The backend returns different data based on the JWT role.

**How backend differentiates**: The `get_current_active_user` dep returns the user. The `BookingService.list_gamer_bookings` filters by `gamer_id = current_user.id` — so gamers only see their own bookings.

**CRITICAL NOTE**: `GET /api/v1/owner/bookings` is a **separate endpoint** — it returns `OwnerBookingItem[]` with `gamerName`, `tierName`, `cafeName` enrichment. Owners should NEVER call `GET /api/v1/bookings` — they get the same scoped gamer view, not their venue's bookings.

**Frontend implementation**:
- Customer portal Bookings page → calls `listBookings()` → `GET /api/v1/bookings`
- Owner portal Bookings page → calls `listOwnerBookings()` → `GET /api/v1/owner/bookings`
- These are separate query keys (`bookings.list` vs `owner.bookings`) and never share cache.
- Role-based routing enforces which portal each user sees.

---

### Edge Case 6: Café Onboarding Role Upgrade Timing

**Scenario**: A user with role `gamer` submits the onboarding form (calls `createCafe()`). The backend:
1. Creates the café
2. Upgrades the user's `role` to `cafe_owner` in the DB

But the user's frontend JWT still contains `role: "gamer"`. The Zustand `authStore.user.role` still reads `"gamer"`. Route guards for `/owner/*` will redirect this user away.

**Prescribed frontend behaviour**:

After `createCafe` mutation `onSuccess`:

```ts
onSuccess: async (data) => {
  // 1. Immediately call /auth/me to get the fresh user object with new role.
  const fresh = await getMe();
  
  // 2. Update the Zustand auth store with the new user (role: 'cafe_owner').
  useAuthStore.getState().setUser(fresh.user);
  
  // 3. Also update localStorage so the new role persists on refresh.
  localStorage.setItem('user', JSON.stringify(fresh.user));
  
  // 4. Invalidate the 'me' query so any consumers refresh.
  queryClient.setQueryData(queryKeys.me, { user: fresh.user });
  
  // 5. Navigate to the owner portal — the role guard will now pass.
  router.push('/owner/dashboard');
}
```

**Why not force a token refresh?** The JWT payload is signed — the frontend cannot update it. The access token will continue to say `role: "gamer"` until it expires and is refreshed. However, the backend uses the **database role** for permission checks (`require_cafe_owner` reads `current_user.role` from the DB, not the JWT claim). So the owner API calls will succeed even with the old token. The frontend only uses `user.role` from the Zustand store (populated from `/auth/me`) for route guarding — and we update that immediately in step 2 above.

---

### Edge Case 7: Double-Submit Prevention on Payment

**Scenario**: User clicks "Pay ₹401" twice rapidly. Two `createBooking` calls fire before the Razorpay modal opens.

**Backend behaviour**: `createPaymentOrder` is idempotent — if a payment record already exists for the booking, it returns the existing order. So duplicate calls are safe.

**Frontend behaviour**: Still prevent double-submit at the UI level:

```ts
const [isProcessing, setIsProcessing] = useState(false);

async function handlePay() {
  if (isProcessing) return;      // Hard guard
  setIsProcessing(true);         // Disable button immediately
  try {
    const order = await createPaymentOrder(bookingId);
    displayRazorpay({
      order_id: order.razorpayOrderId,
      amount: order.amount * 100,  // Convert to paise for Razorpay SDK
      currency: order.currency,
      key: order.keyId,
      handler: async (response) => {
        await verifyPayment({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        router.push(`/bookings/${bookingId}?confirmed=true`);
      },
    });
  } catch (err) {
    setIsProcessing(false);      // Re-enable on error so user can retry
    handlePaymentError(err);
  }
  // Do NOT setIsProcessing(false) on success — Razorpay modal is now open.
  // The page will navigate away on successful payment.
}
```

> [!NOTE]
> The `amount` field in `PaymentOrder` is in **INR (whole rupees)**. The Razorpay SDK expects **paise (× 100)**. Always multiply before passing to the SDK. This is documented in the `PaymentOrder` interface above.
