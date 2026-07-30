export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  role: 'gamer' | 'cafe_owner' | 'staff' | 'admin';
  isActive: boolean;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface TierSpecs {
  gpu?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  monitor?: string;
  peripherals?: string;
}

export interface HardwareTier {
  id: string;
  cafeId: string;
  name: string;
  description?: string | null;
  specs: Record<string, string>;
  totalSeats: number;
  appBookableSeats: number;
  activeSeatsCount: number;
  presetCategory?: string | null;
  performanceRating?: number | null;
  warning?: string | null;
  pricePerHour: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Cafe {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode?: string;
  phoneNumber?: string;
  email?: string;
  openingTime?: string;
  closingTime?: string;
  totalSeats?: number;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'suspended';
  amenities: string[];
  photos: string[];
  hardwareTiers?: HardwareTier[];
}

export interface Promotion {
  id: string;
  cafeId: string;
  title: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
}

export interface Review {
  id: string;
  cafeId: string;
  gamerId: string;
  bookingId?: string;
  rating: number;
  comment?: string;
  isVisible: boolean;
  gamerName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CafeDetail extends Cafe {
  averageRating: number;
  totalReviews: number;
  tiers: HardwareTier[];
  activePromotions: Promotion[];
  recentReviews: Review[];
  createdAt?: string;
  updatedAt?: string;
  rejectionReason?: string | null;
}

export interface CafeListItem {
  id: string;
  name: string;
  city: string;
  state: string;
  averageRating: number;
  totalReviews: number;
  startingPrice: number | null;
  tierNames: string[];
  photos: string[];
  hasActivePromotion: boolean;
  verificationStatus: string;
  isActive: boolean;
  totalSeats?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  convenienceFee: number;
  totalAmount: number;
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  qrCodeUrl?: string;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  checkinMethod?: string | null;
}

export interface BookingDetail extends Booking {
  cafeName?: string | null;
  tierName?: string | null;
  cafeAddress?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OwnerPayoutAccount {
  id: string;
  ownerId: string;
  razorpayAccountId?: string | null;
  kycStatus: 'pending' | 'submitted' | 'activated' | 'suspended' | 'rejected';
  businessPan?: string | null;
  bankAccountNumberMasked?: string | null;
  bankIfsc?: string | null;
  accountHolderName?: string | null;
  submittedAt?: string | null;
}

export interface PromotionDetail {
  id: string;
  cafeId: string;
  title: string;
  description?: string | null;
  discountPercentage: number;
  applicableTierId?: string | null;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses?: number | null;
  currentUses: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCafe extends CafeDetail {
  owner: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber?: string | null;
  };
}
