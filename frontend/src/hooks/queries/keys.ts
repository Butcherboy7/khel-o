import type { CafeListParams, BookingListParams, OwnerBookingParams } from '@/types';

export const queryKeys = {
  cafes: {
    all: ['cafes'] as const,
    list: (params: CafeListParams) => ['cafes', 'list', params] as const,
    detail: (id: string) => ['cafes', 'detail', id] as const,
    tiers: (cafeId: string) => ['cafes', 'tiers', cafeId] as const,
    promotions: (cafeId: string) => ['cafes', 'promotions', cafeId] as const,
    reviews: (cafeId: string, params?: { page?: number; limit?: number }) =>
      ['cafes', 'reviews', cafeId, params] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (params: BookingListParams) => ['bookings', 'list', params] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },
  owner: {
    all: ['owner'] as const,
    dashboard: ['owner', 'dashboard'] as const,
    bookings: (params: OwnerBookingParams) => ['owner', 'bookings', params] as const,
    staff: ['owner', 'staff'] as const,
    payoutStatus: ['owner', 'payoutStatus'] as const,
  },
  admin: {
    all: ['admin'] as const,
    analytics: ['admin', 'analytics'] as const,
    pendingCafes: (params?: { page?: number }) => ['admin', 'pendingCafes', params] as const,
    cafes: (params?: object) => ['admin', 'cafes', params] as const,
    users: (params?: object) => ['admin', 'users', params] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
} as const;
