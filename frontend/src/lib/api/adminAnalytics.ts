import { apiClient, call } from './client';

export interface ExecutiveDashboard {
  totalUsers: number;
  totalCafes: number;
  activeCafes: number;
  newUsersThisPeriod: number;
  newCafesThisPeriod: number;
  bookingsThisPeriod: number;
  gmv: number;
  khelRevenue: number;
  avgBookingValue: number;
  cancellationRate: number;
  repeatBookingRate: number;
  periodDays: number;
}

export async function getExecutiveDashboard(periodDays = 30): Promise<ExecutiveDashboard> {
  return call(() => apiClient.get('/api/v1/admin/analytics/executive', { params: { periodDays } }));
}

export interface CafePerformanceItem {
  cafeId: string;
  cafeName: string;
  city: string;
  bookings: number;
  gmv: number;
  cancellations: number;
  repeatCustomers: number;
  avgBookingValue: number;
  topGame: string | null;
}

export async function getCafePerformance(): Promise<CafePerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/cafes'));
}

export interface SetupPerformanceItem {
  platform: string;
  bookings: number;
  gmv: number;
  totalSeats: number;
  utilizationHours: number;
}

export async function getSetupPerformance(): Promise<SetupPerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/setups'));
}

export interface CityGeographyItem {
  city: string;
  cafeCount: number;
  bookings: number;
  gmv: number;
}

export async function getGeography(): Promise<CityGeographyItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/geography'));
}

export interface RevenueBreakdown {
  gmv: number;
  khelRevenue: number;
  ownerSettlements: number;
  revenueByCity: Record<string, number>;
  revenueByPlatform: Record<string, number>;
}

export async function getRevenueBreakdown(): Promise<RevenueBreakdown> {
  return call(() => apiClient.get('/api/v1/admin/analytics/revenue'));
}

export interface MarketplaceHealth {
  totalBookings: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  failedCount: number;
  totalSearches: number;
  searchesWithNoResults: number;
}

export async function getMarketplaceHealth(): Promise<MarketplaceHealth> {
  return call(() => apiClient.get('/api/v1/admin/analytics/marketplace-health'));
}
