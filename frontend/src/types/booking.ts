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
  /** Consoles/units held. */
  seatsCount?: number;
  /** People playing; more than seatsCount = co-op on one unit. */
  playersCount?: number | null;
  baseAmount: number;
  discountAmount: number;
  gatewayFee: number;
  convenienceFee: number;
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
  /** Admin list only. baseAmount - discountAmount = ownerSettlementAmount (what the café is owed);
   *  platformFeeAmount is what KHELO earns; the two add up to totalAmount (what the customer paid). */
  ownerSettlementAmount?: number | null;
  platformFeeAmount?: number | null;
  offerTitle?: string | null;
  campaignName?: string | null;
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
  /** People playing; more than seatsCount = co-op on one unit. */
  playersCount?: number;
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
  /** Only bookings that used an offer from a campaign. */
  campaignOnly?: boolean;
  page?: number;
  limit?: number;
}
