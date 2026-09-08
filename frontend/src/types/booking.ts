import type { BookingStatus } from './shared';

export interface CancelPolicy {
  allowed: boolean;
  reason: string;
}

export interface Booking {
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
  status: BookingStatus;
  promotionId: string | null;
  qrCodeUrl: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  gamerName?: string | null;
}

export interface BookingDetail extends Booking {
  cafeName: string | null;
  tierName: string | null;
  cafeAddress: string | null;
  gamerName?: string | null;
  cancelPolicy?: CancelPolicy | null;
}

export interface OwnerBookingItem extends Booking {
  gamerName: string;
  tierName: string;
  cafeName: string;
}

export interface BookingCreateRequest {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  seatsCount?: number;
  promotionId?: string;
  /** KHELO code alternative to promotionId — see promo-code entry field on
      the booking wizard and the /redeem/[code] QR deep-link page. */
  promoCode?: string;
  notes?: string;
  game?: string;
}

export interface BookingListParams {
  page?: number;
  limit?: number;
  status?: BookingStatus;
}

export interface OwnerBookingParams {
  cafeId?: string;
  status?: string;
  date?: string;
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
