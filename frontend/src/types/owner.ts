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
  totalCafes: number;
  cafesByStatus: Record<string, number>;
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalBookingsThisMonth: number;
  totalRevenueThisMonth: number;
  totalBookingsAllTime: number;
  totalRevenueAllTime: number;
  topCafesThisMonth: Array<Record<string, unknown>>;
}
