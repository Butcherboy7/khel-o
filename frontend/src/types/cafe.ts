import type { VerificationStatus } from './shared';
import type { HardwareTier } from './tier';
import type { Promotion } from './promotion';
import type { Review } from './review';
import type { User } from './user';

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
  verificationStatus: VerificationStatus;
  isActive: boolean;
  totalSeats: number | null;
  amenities?: string[];
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  openingTime: string | null;
  closingTime: string | null;
  totalSeats: number | null;
  verificationStatus: VerificationStatus;
  isEmergencyMode?: boolean;
  bookingsPaused?: boolean;
  bookableStations?: number;
  appBookableSeats?: number;
  amenities: string[];
  photos: string[];
  rejectionReason: string | null;
  businessPan?: string;
  gstin?: string;
  legalDocumentUrl?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  accountHolderName?: string;
  draftData?: any;
  latitude?: number | null;
  longitude?: number | null;
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

export interface AdminCafe extends CafeDetail {
  owner: User;
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
  latitude?: number | null;
  longitude?: number | null;
  phoneNumber?: string;
  email?: string;
  openingTime?: string;
  closingTime?: string;
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
  reason?: string;
}
