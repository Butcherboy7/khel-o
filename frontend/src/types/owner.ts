import type { KycStatus } from './shared';

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

export interface AdminAnalytics {
  totalUsers: number;
  totalCafes: number;
  totalBookings: number;
  totalRevenue: number;
  pendingCafes: number;
  activePromotions: number;
}
